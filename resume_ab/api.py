"""HTTP API for accounts, uploads, and ratings.

Run with ``python -m resume_ab.api``. The site proxies ``/api/ladder`` here.
"""

from __future__ import annotations

import logging
import os
import re
import secrets
import threading
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from resume_ab.categories import ROLE_DESCRIPTIONS
from resume_ab.cohort import INDUSTRIES, LEVELS, ROLE_IDS, overall_pool, role_pool
from resume_ab.judge import JevJudge, Judge
from resume_ab.load import LoadError, content_sha256, load_resume
from resume_ab.place import place_resume, run_compare
from resume_ab.present import comparison_payload, user_payload, version_payload
from resume_ab.redact import redact
from resume_ab.store import Store, User, strip_controls, write_contained
from resume_ab.textlog import configure_text_log, log_resume_text

status_log = logging.getLogger("resume_ab")

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_BYTES = 5_000_000
_MAX_TEXT = 400_000
_MAX_FIELD = 2_000
_COOKIE = "ladder_session"
_ALLOWED_SUFFIXES = {".txt", ".pdf", ".docx", ".tex"}


class SignupBody(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=200)
    nameOnResume: str = Field(min_length=2, max_length=120)
    level: str
    industry: str
    company: str | None = Field(default=None, max_length=200)


class LoginBody(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class ProfileBody(BaseModel):
    nameOnResume: str = Field(min_length=2, max_length=120)
    level: str
    industry: str
    company: str | None = Field(default=None, max_length=200)


class CompareBody(BaseModel):
    aId: str = Field(max_length=80)
    bId: str = Field(max_length=80)
    role: str = Field(default="overall", max_length=40)
    jd: str | None = Field(default=None, max_length=20_000)


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

    def cookie_flags() -> dict:
        return {"httponly": True, "samesite": "lax", "secure": secure_cookie, "path": "/"}

    def set_session(response: Response, user: User) -> None:
        token = store.create_session(user.id)
        response.set_cookie(_COOKIE, token, max_age=30 * 24 * 3600, **cookie_flags())

    def clear_session(response: Response) -> None:
        response.delete_cookie(_COOKIE, **cookie_flags())

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        # Validation errors echo the submitted value, including passwords.
        return JSONResponse(status_code=422, content={"detail": "Check the fields and try again."})

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    @app.post("/auth/signup")
    def signup(body: SignupBody, response: Response) -> dict:
        email = body.email.strip().lower()
        if strip_controls(email) != email or not _EMAIL.match(email):
            raise HTTPException(status_code=400, detail="Enter a valid email.")
        level, industry, company = _profile_fields(body.level, body.industry, body.company)
        name = _resume_name(body.nameOnResume)
        try:
            user = store.create_user(
                email=email,
                password=body.password,
                name_on_resume=name,
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
        clear_session(response)
        return {"ok": True}

    @app.get("/me")
    def me(user: User = Depends(current_user)) -> dict:
        return user_payload(user)

    @app.patch("/me")
    def update_me(body: ProfileBody, user: User = Depends(current_user)) -> dict:
        level, industry, company = _profile_fields(body.level, body.industry, body.company)
        updated = store.update_user(
            user.id,
            name_on_resume=_resume_name(body.nameOnResume),
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
        clear_session(response)
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
        if len(note) > _MAX_FIELD or len(label) > _MAX_FIELD:
            raise HTTPException(status_code=400, detail="That name or note is too long.")
        filename = _safe_filename(file.filename)
        data = await _read_limited(file, _MAX_BYTES)
        if not data:
            raise HTTPException(status_code=400, detail="That file is empty.")
        suffix = Path(filename).suffix.lower()
        storage_suffix = suffix if suffix in _ALLOWED_SUFFIXES else ".bin"
        try:
            temporary = write_contained(
                store.blob_dir / "incoming",
                f"{secrets.token_hex(16)}{storage_suffix}",
                data,
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Could not read that résumé.") from None
        try:
            try:
                document = load_resume(temporary)
            except LoadError as error:
                raise HTTPException(status_code=400, detail=_public_load_error(error)) from error
            except (OSError, UnicodeError):
                raise HTTPException(status_code=400, detail="Could not read that résumé.") from None
        finally:
            temporary.unlink(missing_ok=True)
        if len(document.text) > _MAX_TEXT:
            raise HTTPException(status_code=400, detail="That résumé is too long to score.")
        redacted = redact(document.text, name=user.name_on_resume)
        log_resume_text(stage="extracted", filename=filename, text=document.text)
        log_resume_text(stage="redacted", filename=filename, text=redacted)
        if len(redacted) < 40:
            raise HTTPException(
                status_code=400,
                detail="No résumé text left after removing contact details.",
            )
        is_draft = draft.strip().lower() in {"1", "true", "yes"}
        try:
            resume, _created = store.add_resume(
                user=user,
                file_name=filename,
                source_type=document.source_type,
                redacted_text=redacted,
                file_bytes=data,
                suffix=suffix if suffix in _ALLOWED_SUFFIXES else ".txt",
                note=note,
                published=not is_draft,
                label=label,
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Could not store that résumé.") from None
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
    cleaned = strip_controls(company or "")
    if len(cleaned) > 80:
        raise HTTPException(status_code=400, detail="Company names need to be under 80 characters.")
    return level, industry, cleaned or None


def _resume_name(value: str) -> str:
    cleaned = strip_controls(value)
    if len(cleaned) < 2:
        raise HTTPException(status_code=400, detail="Enter the name as it appears on your resume.")
    return cleaned[:120]


def _owned(store: Store, user: User, resume_id: str):
    resume = store.get_resume(resume_id)
    if (
        resume is None
        or resume.is_synthetic
        or resume.user_id != user.id
        or resume.tombstoned
    ):
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


def _public_judge_error(_error: Exception) -> str:
    return "The judge could not compare those résumés."


def _safe_filename(raw: str | None) -> str:
    base = (raw or "resume.txt").replace("\\", "/").split("/")[-1]
    base = strip_controls(base)
    base = Path(base).name
    if base in {"", ".", ".."}:
        return "resume.txt"
    return base[:120]


async def _read_limited(file: UploadFile, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(min(65_536, limit - total + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(status_code=400, detail="Résumé files need to be under 5 MB.")
        chunks.append(chunk)
    return b"".join(chunks)


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
    secure_cookie = os.environ.get("LADDER_SECURE_COOKIES", "").strip().lower() in {"1", "true", "yes"}
    return create_app(store, JevJudge(), sync=False, resume_jobs=True, secure_cookie=secure_cookie)


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
