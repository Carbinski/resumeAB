"""HTTP API for accounts, uploads, and ratings.

Run with ``python -m resume_ab.api``. The site proxies ``/api/ladder`` here.
"""

from __future__ import annotations

import logging
import os
import re
import threading
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from resume_ab.categories import ROLE_DESCRIPTIONS
from resume_ab.cohort import INDUSTRIES, LEVELS, ROLE_IDS, overall_pool, role_pool
from resume_ab.judge import JevJudge, Judge
from resume_ab.load import LoadError, content_sha256, load_resume
from resume_ab.place import place_resume, run_compare
from resume_ab.present import comparison_payload, user_payload, version_payload
from resume_ab.redact import redact
from resume_ab.store import Store, User
from resume_ab.textlog import configure_text_log, log_resume_text

status_log = logging.getLogger("resume_ab")

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_BYTES = 5_000_000
_COOKIE = "ladder_session"


class SignupBody(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=200)
    nameOnResume: str = Field(min_length=2, max_length=120)
    level: str
    industry: str
    company: str | None = None


class LoginBody(BaseModel):
    email: str
    password: str


class ProfileBody(BaseModel):
    nameOnResume: str = Field(min_length=2, max_length=120)
    level: str
    industry: str
    company: str | None = None


class CompareBody(BaseModel):
    aId: str
    bId: str
    role: str = "overall"
    jd: str | None = None


def create_app(
    store: Store,
    judge: Judge | None = None,
    *,
    sync: bool = False,
    resume_jobs: bool = False,
    secure_cookie: bool = False,
) -> FastAPI:
    judge = judge or JevJudge()
    app = FastAPI(title="Ladder")
    app.state.store = store
    app.state.judge = judge
    inflight: set[tuple[str, str]] = set()
    inflight_lock = threading.Lock()

    def spawn(resume_id: str, pool_id: str) -> None:
        key = (resume_id, pool_id)
        with inflight_lock:
            if key in inflight:
                return
            inflight.add(key)

        def job() -> None:
            try:
                place_resume(store, judge, resume_id, pool_id)
            finally:
                with inflight_lock:
                    inflight.discard(key)

        if sync:
            job()
        else:
            threading.Thread(target=job, daemon=True).start()

    if resume_jobs:
        for resume_id, pool_id in store.incomplete_jobs():
            spawn(resume_id, pool_id)

    def current_user(request: Request) -> User:
        raw = request.cookies.get(_COOKIE)
        if not raw:
            raise HTTPException(status_code=401, detail="Sign in required.")
        user = store.user_for_token(raw)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        return user

    def optional_user(request: Request) -> User | None:
        raw = request.cookies.get(_COOKIE)
        if not raw:
            return None
        return store.user_for_token(raw)

    def set_session(response: Response, user: User) -> None:
        token = store.create_session(user.id)
        response.set_cookie(
            _COOKIE,
            token,
            httponly=True,
            samesite="lax",
            secure=secure_cookie,
            max_age=30 * 24 * 3600,
            path="/",
        )

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    @app.post("/auth/signup")
    def signup(body: SignupBody, response: Response) -> dict:
        email = body.email.strip().lower()
        if not _EMAIL.match(email):
            raise HTTPException(status_code=400, detail="Enter a valid email.")
        level, industry, company = _profile_fields(body.level, body.industry, body.company)
        try:
            user = store.create_user(
                email=email,
                password=body.password,
                name_on_resume=body.nameOnResume.strip(),
                level=level,
                industry=industry,
                company=company,
            )
        except Exception as error:
            if "UNIQUE" in str(error).upper():
                raise HTTPException(status_code=409, detail="An account with that email already exists.") from error
            raise
        set_session(response, user)
        return user_payload(user)

    @app.post("/auth/login")
    def login(body: LoginBody, response: Response) -> dict:
        user = store.authenticate(body.email.strip(), body.password)
        if user is None:
            raise HTTPException(status_code=401, detail="Email or password is wrong.")
        set_session(response, user)
        return user_payload(user)

    @app.post("/auth/logout")
    def logout(request: Request, response: Response) -> dict:
        raw = request.cookies.get(_COOKIE)
        if raw:
            store.delete_session(raw)
        response.delete_cookie(_COOKIE, path="/")
        return {"ok": True}

    @app.get("/me")
    def me(user: User = Depends(current_user)) -> dict:
        return user_payload(user)

    @app.patch("/me")
    def update_me(body: ProfileBody, user: User = Depends(current_user)) -> dict:
        level, industry, company = _profile_fields(body.level, body.industry, body.company)
        updated = store.update_user(
            user.id,
            name_on_resume=body.nameOnResume.strip(),
            level=level,
            industry=industry,
            company=company,
        )
        return user_payload(updated)

    @app.delete("/me")
    def delete_me(request: Request, response: Response, user: User = Depends(current_user)) -> dict:
        raw = request.cookies.get(_COOKIE)
        store.delete_account(user.id)
        if raw:
            store.delete_session(raw)
        response.delete_cookie(_COOKIE, path="/")
        return {"ok": True}

    @app.get("/versions")
    def versions(user: User | None = Depends(optional_user)) -> list:
        if user is None:
            return []
        return [version_payload(store, resume) for resume in store.list_published(user.id)]

    @app.post("/versions")
    async def upload(
        file: UploadFile = File(...),
        note: str = Form(""),
        draft: str = Form("false"),
        label: str = Form(""),
        user: User = Depends(current_user),
    ) -> dict:
        filename = Path(file.filename or "resume.txt").name
        if filename in {"", ".", ".."}:
            filename = "resume.txt"
        data = await file.read()
        if len(data) > _MAX_BYTES:
            raise HTTPException(status_code=400, detail="Résumé files need to be under 5 MB.")
        if not data:
            raise HTTPException(status_code=400, detail="That file is empty.")
        suffix = Path(filename).suffix.lower()
        incoming = store.blob_dir / "incoming"
        incoming.mkdir(parents=True, exist_ok=True)
        temporary = incoming / f"{threading.get_ident()}-{filename}"
        temporary.write_bytes(data)
        try:
            try:
                document = load_resume(temporary)
            except LoadError as error:
                raise HTTPException(status_code=400, detail=_public_load_error(error)) from error
        finally:
            temporary.unlink(missing_ok=True)
        redacted = redact(document.text, name=user.name_on_resume)
        log_resume_text(stage="extracted", filename=filename, text=document.text)
        log_resume_text(stage="redacted", filename=filename, text=redacted)
        if len(redacted) < 40:
            raise HTTPException(
                status_code=400,
                detail="No résumé text left after removing contact details.",
            )
        is_draft = draft.strip().lower() in {"1", "true", "yes"}
        resume, _created = store.add_resume(
            user=user,
            file_name=filename,
            source_type=document.source_type,
            redacted_text=redacted,
            file_bytes=data,
            suffix=suffix or ".txt",
            note=note.strip()[:500],
            published=not is_draft,
            label=label,
        )
        if resume.published:
            _start_overall(store, spawn, resume)
        return version_payload(store, store.get_resume(resume.id) or resume)

    @app.delete("/versions/{resume_id}")
    def delete_version(resume_id: str, user: User = Depends(current_user)) -> dict:
        if not store.delete_resume(user.id, resume_id):
            raise HTTPException(status_code=404, detail="Résumé not found.")
        return {"ok": True}

    @app.post("/versions/{resume_id}/publish")
    def publish(resume_id: str, user: User = Depends(current_user)) -> dict:
        resume = store.publish(user.id, resume_id)
        if resume is None:
            raise HTTPException(status_code=404, detail="Résumé not found.")
        _start_overall(store, spawn, resume)
        fresh = store.get_resume(resume.id) or resume
        return version_payload(store, fresh)

    @app.post("/versions/{resume_id}/roles/{role}")
    def rate_role(resume_id: str, role: str, user: User = Depends(current_user)) -> dict:
        if role not in ROLE_IDS:
            raise HTTPException(status_code=404, detail="Unknown role.")
        resume = _owned(store, user, resume_id)
        if resume.redacted_text is None or resume.level is None:
            raise HTTPException(status_code=400, detail="That version's text has been removed.")
        pool_id = role_pool(resume.level, role)
        store.ensure_pool_anchors(pool_id, resume.level)
        membership = store.memberships_for(resume.id).get(pool_id)
        if membership is None or membership.status == "error":
            if membership is not None:
                store.set_status(resume.id, pool_id, "placing", None)
            else:
                store.ensure_membership(resume.id, pool_id)
            spawn(resume.id, pool_id)
        elif membership.status in {"placing", "provisional"}:
            pass
        fresh = store.get_resume(resume.id) or resume
        return version_payload(store, fresh)

    @app.post("/compare")
    def compare(body: CompareBody, user: User = Depends(current_user)) -> dict:
        if body.aId == body.bId:
            raise HTTPException(status_code=400, detail="Pick two different versions.")
        left = _owned(store, user, body.aId)
        right = _owned(store, user, body.bId)
        if left.redacted_text is None or right.redacted_text is None:
            raise HTTPException(status_code=400, detail="That version's text has been removed.")
        role = body.role or "overall"
        description: str | None
        if body.jd and body.jd.strip():
            description = body.jd.strip()[:8000]
            pool_key = f"jd:{content_sha256(description)}"
            response_role = role if role in {"overall", *ROLE_IDS} else "overall"
        elif role in ROLE_IDS:
            description = ROLE_DESCRIPTIONS[role]
            pool_key = role
            response_role = role
        elif role == "overall":
            description = None
            pool_key = "overall"
            response_role = "overall"
        else:
            raise HTTPException(status_code=400, detail="Unknown role.")
        try:
            result = run_compare(
                store,
                judge,
                left,
                right,
                role_description=description,
                pool_key=pool_key,
                categories=True,
            )
        except Exception as error:
            raise HTTPException(status_code=502, detail=_public_judge_error(error)) from error
        return comparison_payload(store, left, right, result, role=response_role)

    return app


def _profile_fields(level: str, industry: str, company: str | None) -> tuple[str, str, str | None]:
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail="Level must be intern or new grad.")
    if industry not in INDUSTRIES:
        raise HTTPException(status_code=400, detail="Pick an industry from the list.")
    cleaned = (company or "").strip()
    if len(cleaned) > 80:
        raise HTTPException(status_code=400, detail="Company names need to be under 80 characters.")
    return level, industry, cleaned or None


def _owned(store: Store, user: User, resume_id: str):
    resume = store.get_resume(resume_id)
    if resume is None or resume.user_id != user.id or resume.tombstoned:
        raise HTTPException(status_code=404, detail="Résumé not found.")
    return resume


def _start_overall(store: Store, spawn, resume) -> None:
    if resume.level is None:
        return
    pool_id = overall_pool(resume.level)
    membership = store.memberships_for(resume.id).get(pool_id)
    if membership is None:
        store.ensure_membership(resume.id, pool_id)
        spawn(resume.id, pool_id)
        return
    if membership.status == "error":
        store.set_status(resume.id, pool_id, "placing", None)
        spawn(resume.id, pool_id)
    elif membership.status == "placing" and membership.match_count == 0:
        spawn(resume.id, pool_id)


def _public_load_error(error: LoadError) -> str:
    message = str(error)
    if "Unsupported" in message or "Legacy" in message:
        return "Use a .pdf, .docx, .tex, or .txt résumé."
    if "No text" in message or "Image-only" in message:
        return "No text found in that file. Image-only PDFs need to be exported as text first."
    return "Could not read that résumé."


def _public_judge_error(error: Exception) -> str:
    message = str(error).strip()
    if not message or len(message) > 180:
        return "The judge could not compare those résumés."
    return message


def _load_dotenv(path: Path = Path(".env")) -> None:
    """Pick up ``TYPESAFE_API_KEY`` from a local ``.env`` without overriding the shell."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def build_default_app() -> FastAPI:
    _load_dotenv()
    data = Path(os.environ.get("LADDER_DATA", "data"))
    log_path = configure_text_log(data)
    if os.environ.get("TYPESAFE_API_KEY", "").strip():
        status_log.warning("TYPESAFE_API_KEY is set. Résumé text logs: %s", log_path)
    else:
        status_log.warning("TYPESAFE_API_KEY is not set. Matchups will fail. Résumé text logs: %s", log_path)
    store = Store(data / "ladder.db", data / "blobs")
    store.seed_anchors()
    return create_app(store, JevJudge(), sync=False, resume_jobs=True)


app = build_default_app()


def main() -> None:
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("LADDER_HOST", "127.0.0.1"),
        port=int(os.environ.get("LADDER_PORT", "8000")),
        reload=False,
    )


if __name__ == "__main__":
    main()
