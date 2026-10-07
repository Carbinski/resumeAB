"""SQLite accounts, résumé versions, and match results.

Résumé text lives in the row only so the judge can run. The match table stores
hashes and probabilities. Deleting an account wipes the text and keeps the
hashes so other ratings still stand.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from resume_ab.anchors import all_anchors
from resume_ab.load import content_sha256
from resume_ab.rating import fit_elo
from resume_ab.redact import redact
from resume_ab.schedule import Candidate

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name_on_resume TEXT NOT NULL,
    level TEXT NOT NULL,
    industry TEXT NOT NULL,
    company TEXT,
    focus TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resumes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    is_synthetic INTEGER NOT NULL DEFAULT 0,
    anchor_slot INTEGER,
    anchor_level TEXT,
    level TEXT,
    industry TEXT,
    company TEXT,
    file_name TEXT,
    label TEXT,
    note TEXT NOT NULL DEFAULT '',
    source_type TEXT,
    content_sha256 TEXT NOT NULL,
    redacted_text TEXT,
    file_path TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    purged INTEGER NOT NULL DEFAULT 0,
    tombstoned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
    resume_id TEXT NOT NULL,
    pool_id TEXT NOT NULL,
    elo REAL NOT NULL DEFAULT 1000,
    match_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error TEXT,
    PRIMARY KEY (resume_id, pool_id)
);

CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    left_id TEXT NOT NULL,
    right_id TEXT NOT NULL,
    left_sha TEXT NOT NULL,
    right_sha TEXT NOT NULL,
    p_left REAL NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (pool_id, left_sha, right_sha)
);

CREATE TABLE IF NOT EXISTS category_scores (
    resume_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    elo REAL NOT NULL,
    PRIMARY KEY (resume_id, category_id)
);

CREATE TABLE IF NOT EXISTS comparisons (
    pool_key TEXT NOT NULL,
    left_sha TEXT NOT NULL,
    right_sha TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (pool_key, left_sha, right_sha)
);
"""


_LABEL_LIMIT = 80
_NOTE_LIMIT = 500
_FILE_NAME_LIMIT = 120
_MAX_PASSWORD_CHARS = 200
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_ALLOWED_SUFFIXES = {".txt", ".pdf", ".docx", ".tex"}
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_BLOB_NAME = re.compile(r"[A-Za-z0-9._-]{1,80}")
_DUMMY_PASSWORD_HASH: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def strip_controls(value: str) -> str:
    """Drop NUL and other control characters so a field cannot break a log or header."""
    return _CONTROL.sub("", value).strip()


def _clean_label(label: str | None) -> str | None:
    """A user-supplied name, stripped and capped. Blank is not a name."""
    if label is None:
        return None
    cleaned = strip_controls(label)[:_LABEL_LIMIT]
    return cleaned or None


def _clean_note(note: str | None) -> str:
    if not note:
        return ""
    return strip_controls(note)[:_NOTE_LIMIT]


def _clean_file_name(name: str | None) -> str:
    base = (name or "resume.txt").replace("\\", "/").split("/")[-1]
    base = strip_controls(base).strip().strip(".")
    if not base or base in {".", ".."}:
        return "resume.txt"
    return base[:_FILE_NAME_LIMIT]


def _password_bytes(password: str) -> bytes | None:
    if not isinstance(password, str) or not password or len(password) > _MAX_PASSWORD_CHARS:
        return None
    try:
        encoded = password.encode("utf-8")
    except UnicodeError:
        return None
    if len(encoded) > 1024:
        return None
    return encoded


def hash_password(password: str) -> str:
    encoded = _password_bytes(password)
    if encoded is None or len(password) < 8:
        raise ValueError("password length")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        encoded,
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=32,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def _dummy_password_hash() -> str:
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        _DUMMY_PASSWORD_HASH = hash_password("dummy-password-value")
    return _DUMMY_PASSWORD_HASH


def _session_digest(raw: str) -> str | None:
    if not isinstance(raw, str) or not raw or len(raw) > 128:
        return None
    return hashlib.sha256(raw.encode()).hexdigest()


def verify_password(password: str, stored: str) -> bool:
    encoded = _password_bytes(password)
    if encoded is None:
        return False
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        n_i, r_i, p_i = int(n), int(r), int(p)
        if (n_i, r_i, p_i) != (_SCRYPT_N, _SCRYPT_R, _SCRYPT_P):
            return False
        if len(salt) != 32 or len(digest) != 64:
            return False
        check = hashlib.scrypt(
            encoded,
            salt=bytes.fromhex(salt),
            n=n_i,
            r=r_i,
            p=p_i,
            dklen=32,
        )
        return hmac.compare_digest(check, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False


def write_contained(root: Path, name: str, data: bytes) -> Path:
    """Write ``data`` as ``name`` inside ``root``. ``name`` is one path segment."""
    if not _BLOB_NAME.fullmatch(name):
        raise ValueError("name")
    root.mkdir(parents=True, exist_ok=True)
    base = root.resolve()
    blob = (base / name).resolve()
    if blob.parent != base:
        raise ValueError("path")
    _write_private(blob, data)
    return blob


def _write_private(blob: Path, data: bytes) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(blob, flags, 0o600)
    try:
        view = memoryview(data)
        while view:
            written = os.write(fd, view)
            if written <= 0:
                raise OSError("short write")
            view = view[written:]
        os.fchmod(fd, 0o600)
    except Exception:
        os.close(fd)
        blob.unlink(missing_ok=True)
        raise
    else:
        os.close(fd)


@dataclass
class User:
    id: str
    email: str
    name_on_resume: str
    level: str
    industry: str
    company: str | None
    focus: str


@dataclass
class Resume:
    id: str
    user_id: str | None
    is_synthetic: bool
    anchor_slot: int | None
    anchor_level: str | None
    level: str | None
    industry: str | None
    company: str | None
    file_name: str | None
    label: str | None
    note: str
    source_type: str | None
    content_sha256: str
    redacted_text: str | None
    file_path: str | None
    published: bool
    purged: bool
    tombstoned: bool
    created_at: str


@dataclass
class Membership:
    resume_id: str
    pool_id: str
    elo: float
    match_count: int
    status: str
    error: str | None


def _user(row: sqlite3.Row) -> User:
    return User(
        id=row["id"],
        email=row["email"],
        name_on_resume=row["name_on_resume"],
        level=row["level"],
        industry=row["industry"],
        company=row["company"],
        focus=row["focus"] or "",
    )


def _resume(row: sqlite3.Row) -> Resume:
    return Resume(
        id=row["id"],
        user_id=row["user_id"],
        is_synthetic=bool(row["is_synthetic"]),
        anchor_slot=row["anchor_slot"],
        anchor_level=row["anchor_level"],
        level=row["level"],
        industry=row["industry"],
        company=row["company"],
        file_name=row["file_name"],
        label=row["label"],
        note=row["note"] or "",
        source_type=row["source_type"],
        content_sha256=row["content_sha256"],
        redacted_text=row["redacted_text"],
        file_path=row["file_path"],
        published=bool(row["published"]),
        purged=bool(row["purged"]),
        tombstoned=bool(row["tombstoned"]),
        created_at=row["created_at"],
    )


def _membership(row: sqlite3.Row) -> Membership:
    return Membership(
        resume_id=row["resume_id"],
        pool_id=row["pool_id"],
        elo=row["elo"],
        match_count=row["match_count"],
        status=row["status"],
        error=row["error"],
    )


class Store:
    def __init__(self, path: Path, blob_dir: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        blob_dir.mkdir(parents=True, exist_ok=True)
        self.blob_dir = blob_dir
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        self._ensure_focus_column()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _ensure_focus_column(self) -> None:
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(users)")}
        if "focus" in columns:
            return
        self._conn.execute("ALTER TABLE users ADD COLUMN focus TEXT NOT NULL DEFAULT ''")
        self._conn.commit()

    def seed_anchors(self) -> None:
        with self._lock:
            for spec in all_anchors():
                resume_id = f"anchor-{spec.level}-{spec.slot}"
                text = redact(spec.text)
                digest = content_sha256(text)
                row = self._conn.execute("SELECT content_sha256 FROM resumes WHERE id = ?", (resume_id,)).fetchone()
                if row is None:
                    self._conn.execute(
                        """
                        INSERT INTO resumes (
                            id, user_id, is_synthetic, anchor_slot, anchor_level, level,
                            content_sha256, redacted_text, published, created_at, note, label, file_name
                        ) VALUES (?, NULL, 1, ?, ?, ?, ?, ?, 0, ?, '', ?, ?)
                        """,
                        (
                            resume_id,
                            spec.slot,
                            spec.level,
                            spec.level,
                            digest,
                            text,
                            _now(),
                            f"Anchor {spec.slot + 1}",
                            "synthetic.txt",
                        ),
                    )
                elif row["content_sha256"] != digest:
                    played = self._conn.execute(
                        "SELECT COUNT(*) AS n FROM matches WHERE left_id = ? OR right_id = ?",
                        (resume_id, resume_id),
                    ).fetchone()["n"]
                    if played == 0:
                        self._conn.execute(
                            "UPDATE resumes SET content_sha256 = ?, redacted_text = ? WHERE id = ?",
                            (digest, text, resume_id),
                        )
                self._insert_membership(resume_id, spec.level, "rated")
            self._conn.commit()

    def ensure_pool_anchors(self, pool_id: str, level: str) -> None:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id FROM resumes WHERE is_synthetic = 1 AND anchor_level = ?",
                (level,),
            ).fetchall()
            for row in rows:
                self._insert_membership(row["id"], pool_id, "rated")
            self._conn.commit()

    def create_user(
        self,
        *,
        email: str,
        password: str,
        name_on_resume: str,
        level: str,
        industry: str,
        company: str | None,
        focus: str = "",
    ) -> User:
        with self._lock:
            user_id = uuid.uuid4().hex
            self._conn.execute(
                """
                INSERT INTO users (
                    id, email, password_hash, name_on_resume, level, industry, company, focus, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    email.lower(),
                    hash_password(password),
                    name_on_resume,
                    level,
                    industry,
                    company,
                    focus,
                    _now(),
                ),
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            return _user(row)

    def authenticate(self, email: str, password: str) -> User | None:
        if _password_bytes(password) is None:
            verify_password("dummy-password-value", _dummy_password_hash())
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL",
                (email.strip().lower(),),
            ).fetchone()
            stored = row["password_hash"] if row else _dummy_password_hash()
            if row is None or not verify_password(password, stored):
                return None
            return _user(row)

    def get_user(self, user_id: str) -> User | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
                (user_id,),
            ).fetchone()
            return _user(row) if row else None

    def update_user(
        self,
        user_id: str,
        *,
        name_on_resume: str,
        level: str,
        industry: str,
        company: str | None,
        focus: str,
    ) -> User:
        with self._lock:
            self._conn.execute(
                """
                UPDATE users
                SET name_on_resume = ?, level = ?, industry = ?, company = ?, focus = ?
                WHERE id = ? AND deleted_at IS NULL
                """,
                (name_on_resume, level, industry, company, focus, user_id),
            )
            self._conn.commit()
            return self.get_user(user_id)  # type: ignore[return-value]

    def create_session(self, user_id: str, *, days: int = 30) -> str:
        raw = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        with self._lock:
            self._conn.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(raw.encode()).hexdigest(), user_id, expires),
            )
            self._conn.commit()
        return raw

    def user_for_token(self, raw: str) -> User | None:
        digest = _session_digest(raw)
        if digest is None:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT users.* FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.deleted_at IS NULL
                """,
                (digest, _now()),
            ).fetchone()
            return _user(row) if row else None

    def delete_session(self, raw: str) -> None:
        digest = _session_digest(raw)
        if digest is None:
            return
        with self._lock:
            self._conn.execute("DELETE FROM sessions WHERE token_hash = ?", (digest,))
            self._conn.commit()

    def delete_account(self, user_id: str) -> None:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, file_path FROM resumes WHERE user_id = ?",
                (user_id,),
            ).fetchall()
            for row in rows:
                self._unlink(row["file_path"])
                self._conn.execute(
                    """
                    UPDATE resumes
                    SET redacted_text = NULL, file_path = NULL, purged = 1, tombstoned = 1,
                        company = NULL, file_name = NULL, note = '', label = NULL
                    WHERE id = ?
                    """,
                    (row["id"],),
                )
            self._conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            self._conn.execute(
                """
                UPDATE users
                SET email = ?, name_on_resume = '', company = NULL, deleted_at = ?, password_hash = ?
                WHERE id = ?
                """,
                (f"deleted-{user_id}@invalid", _now(), "scrypt$deleted", user_id),
            )
            self._conn.commit()

    def add_resume(
        self,
        *,
        user: User,
        file_name: str,
        source_type: str,
        redacted_text: str,
        file_bytes: bytes,
        suffix: str,
        note: str,
        published: bool,
        label: str | None = None,
    ) -> tuple[Resume, bool]:
        """Returns the résumé and whether this call created it.

        ``label`` is the name the user typed. When it is missing, a published
        résumé is named ``vN`` and a draft is left unnamed (shown as Draft).
        """
        digest = content_sha256(redacted_text)
        provided = _clean_label(label)
        note = _clean_note(note)
        file_name = _clean_file_name(file_name)
        with self._lock:
            existing = self._conn.execute(
                """
                SELECT * FROM resumes
                WHERE user_id = ? AND content_sha256 = ? AND tombstoned = 0
                """,
                (user.id, digest),
            ).fetchone()
            if existing is not None:
                resume = _resume(existing)
                if published and not resume.published:
                    stored_label = provided or self._label_or_next(user.id, resume.label)
                    self._conn.execute(
                        "UPDATE resumes SET published = 1, label = ?, note = ? WHERE id = ?",
                        (stored_label, note or resume.note, resume.id),
                    )
                    self._conn.commit()
                    return self._resume_by_id(resume.id), False
                return resume, False

            resume_id = uuid.uuid4().hex
            blob = self._blob_for(resume_id, suffix)
            _write_private(blob, file_bytes)
            stored_label = provided or (self._next_label(user.id) if published else None)
            self._conn.execute(
                """
                INSERT INTO resumes (
                    id, user_id, is_synthetic, level, industry, company, file_name, label, note,
                    source_type, content_sha256, redacted_text, file_path, published, created_at
                ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    resume_id,
                    user.id,
                    user.level,
                    user.industry,
                    user.company,
                    file_name,
                    stored_label,
                    note,
                    source_type,
                    digest,
                    redacted_text,
                    str(blob),
                    1 if published else 0,
                    _now(),
                ),
            )
            self._purge_overflow(user.id, keep=20)
            self._conn.commit()
            return self._resume_by_id(resume_id), True

    def publish(self, user_id: str, resume_id: str) -> Resume | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT * FROM resumes
                WHERE id = ? AND user_id = ? AND tombstoned = 0 AND is_synthetic = 0
                """,
                (resume_id, user_id),
            ).fetchone()
            if row is None:
                return None
            resume = _resume(row)
            if resume.published:
                return resume
            label = self._label_or_next(user_id, resume.label)
            self._conn.execute(
                "UPDATE resumes SET published = 1, label = ? WHERE id = ?",
                (label, resume_id),
            )
            self._conn.commit()
            return self._resume_by_id(resume_id)

    def delete_resume(self, user_id: str, resume_id: str) -> bool:
        """Tombstone one résumé owned by ``user_id``.

        The file and extracted text go away. Match rows stay so other ratings
        still stand. Synthetic anchors and other people's résumés are refused.
        """
        with self._lock:
            row = self._conn.execute(
                "SELECT user_id, is_synthetic, file_path, tombstoned FROM resumes WHERE id = ?",
                (resume_id,),
            ).fetchone()
            if row is None or row["is_synthetic"] or row["user_id"] != user_id or row["tombstoned"]:
                return False
            self._unlink(row["file_path"])
            self._conn.execute(
                """
                UPDATE resumes
                SET redacted_text = NULL, file_path = NULL, purged = 1, tombstoned = 1,
                    company = NULL, file_name = NULL, note = '', label = NULL
                WHERE id = ? AND user_id = ? AND is_synthetic = 0
                """,
                (resume_id, user_id),
            )
            self._conn.commit()
            return True

    def list_published(self, user_id: str) -> list[Resume]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT * FROM resumes
                WHERE user_id = ? AND published = 1 AND tombstoned = 0
                ORDER BY created_at
                """,
                (user_id,),
            ).fetchall()
            return [_resume(row) for row in rows]

    def get_resume(self, resume_id: str) -> Resume | None:
        with self._lock:
            return self._resume_by_id(resume_id)

    def previous_published(self, user_id: str, before_created_at: str) -> Resume | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT * FROM resumes
                WHERE user_id = ? AND published = 1 AND tombstoned = 0 AND created_at < ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (user_id, before_created_at),
            ).fetchone()
            return _resume(row) if row else None

    def _insert_membership(self, resume_id: str, pool_id: str, status: str) -> None:
        self._conn.execute(
            """
            INSERT INTO memberships (resume_id, pool_id, elo, match_count, status)
            VALUES (?, ?, 1000, 0, ?)
            ON CONFLICT (resume_id, pool_id) DO NOTHING
            """,
            (resume_id, pool_id, status),
        )

    def ensure_membership(self, resume_id: str, pool_id: str, *, status: str = "placing") -> Membership:
        with self._lock:
            self._insert_membership(resume_id, pool_id, status)
            self._conn.commit()
            row = self._conn.execute(
                "SELECT * FROM memberships WHERE resume_id = ? AND pool_id = ?",
                (resume_id, pool_id),
            ).fetchone()
            return _membership(row)

    def memberships_for(self, resume_id: str) -> dict[str, Membership]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM memberships WHERE resume_id = ?",
                (resume_id,),
            ).fetchall()
            return {row["pool_id"]: _membership(row) for row in rows}

    def set_status(self, resume_id: str, pool_id: str, status: str, error: str | None = None) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE memberships SET status = ?, error = ? WHERE resume_id = ? AND pool_id = ?",
                (status, error, resume_id, pool_id),
            )
            self._conn.commit()

    def candidates(self, pool_id: str) -> list[Candidate]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT resumes.id, resumes.anchor_slot, memberships.elo
                FROM memberships
                JOIN resumes ON resumes.id = memberships.resume_id
                WHERE memberships.pool_id = ?
                  AND resumes.tombstoned = 0
                  AND resumes.redacted_text IS NOT NULL
                """,
                (pool_id,),
            ).fetchall()
            return [
                Candidate(id=row["id"], elo=row["elo"], anchor_slot=row["anchor_slot"])
                for row in rows
            ]

    def played_with(self, pool_id: str, resume_id: str) -> set[str]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT left_id, right_id FROM matches
                WHERE pool_id = ? AND (left_id = ? OR right_id = ?)
                """,
                (pool_id, resume_id, resume_id),
            ).fetchall()
            return {
                row["right_id"] if row["left_id"] == resume_id else row["left_id"]
                for row in rows
            }

    def save_match(
        self,
        *,
        pool_id: str,
        left_id: str,
        left_sha: str,
        right_id: str,
        right_sha: str,
        p_left: float,
        model: str,
    ) -> None:
        if left_sha == right_sha:
            return
        if left_sha > right_sha:
            left_id, right_id = right_id, left_id
            left_sha, right_sha = right_sha, left_sha
            p_left = 1 - p_left
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO matches (id, pool_id, left_id, right_id, left_sha, right_sha, p_left, model, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (pool_id, left_sha, right_sha) DO NOTHING
                """,
                (uuid.uuid4().hex, pool_id, left_id, right_id, left_sha, right_sha, p_left, model, _now()),
            )
            self._conn.commit()

    def refit(self, pool_id: str) -> None:
        with self._lock:
            members = [
                row["resume_id"]
                for row in self._conn.execute(
                    "SELECT resume_id FROM memberships WHERE pool_id = ? ORDER BY resume_id",
                    (pool_id,),
                ).fetchall()
            ]
            if not members:
                return
            index = {resume_id: position for position, resume_id in enumerate(members)}
            observations = []
            counts = {resume_id: 0 for resume_id in members}
            rows = self._conn.execute(
                "SELECT left_id, right_id, p_left FROM matches WHERE pool_id = ?",
                (pool_id,),
            ).fetchall()
            for row in rows:
                if row["left_id"] not in index or row["right_id"] not in index:
                    continue
                observations.append((index[row["left_id"]], index[row["right_id"]], row["p_left"]))
                counts[row["left_id"]] += 1
                counts[row["right_id"]] += 1
            ratings = fit_elo(len(members), observations)
            for resume_id, elo in zip(members, ratings):
                self._conn.execute(
                    "UPDATE memberships SET elo = ?, match_count = ? WHERE resume_id = ? AND pool_id = ?",
                    (elo, counts[resume_id], resume_id, pool_id),
                )
            self._conn.commit()

    def category_scores(self, resume_id: str) -> dict[str, float]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT category_id, elo FROM category_scores WHERE resume_id = ?",
                (resume_id,),
            ).fetchall()
            return {row["category_id"]: row["elo"] for row in rows}

    def set_category(self, resume_id: str, category_id: str, elo: float) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO category_scores (resume_id, category_id, elo)
                VALUES (?, ?, ?)
                ON CONFLICT (resume_id, category_id) DO UPDATE SET elo = excluded.elo
                """,
                (resume_id, category_id, elo),
            )
            self._conn.commit()

    def has_categories(self, resume_id: str) -> bool:
        return bool(self.category_scores(resume_id))

    def comparison_payload(self, pool_key: str, left_sha: str, right_sha: str) -> str | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT payload FROM comparisons WHERE pool_key = ? AND left_sha = ? AND right_sha = ?",
                (pool_key, left_sha, right_sha),
            ).fetchone()
            return row["payload"] if row else None

    def save_comparison(self, pool_key: str, left_sha: str, right_sha: str, payload: str) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO comparisons (pool_key, left_sha, right_sha, payload, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (pool_key, left_sha, right_sha) DO NOTHING
                """,
                (pool_key, left_sha, right_sha, payload, _now()),
            )
            self._conn.commit()

    def pool_rows(self, pool_id: str) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(
                """
                SELECT resumes.id, resumes.level, resumes.industry, resumes.company,
                       resumes.is_synthetic, resumes.tombstoned, memberships.elo, memberships.status
                FROM memberships
                JOIN resumes ON resumes.id = memberships.resume_id
                WHERE memberships.pool_id = ?
                """,
                (pool_id,),
            ).fetchall()

    def incomplete_jobs(self) -> list[tuple[str, str]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT memberships.resume_id, memberships.pool_id
                FROM memberships
                JOIN resumes ON resumes.id = memberships.resume_id
                WHERE memberships.status IN ('placing', 'provisional')
                  AND resumes.is_synthetic = 0
                  AND resumes.tombstoned = 0
                """
            ).fetchall()
            return [(row["resume_id"], row["pool_id"]) for row in rows]

    def _resume_by_id(self, resume_id: str) -> Resume | None:
        row = self._conn.execute("SELECT * FROM resumes WHERE id = ?", (resume_id,)).fetchone()
        return _resume(row) if row else None

    def _next_label(self, user_id: str) -> str:
        """Smallest ``vN`` that is not already the name of one of this user's live résumés."""
        rows = self._conn.execute(
            """
            SELECT label FROM resumes
            WHERE user_id = ? AND tombstoned = 0 AND label IS NOT NULL AND label != ''
            """,
            (user_id,),
        ).fetchall()
        taken = {row["label"] for row in rows}
        number = 1
        while f"v{number}" in taken:
            number += 1
        return f"v{number}"

    def _label_or_next(self, user_id: str, current: str | None) -> str:
        """Keep a stored name. Only a blank label falls back to ``vN``."""
        kept = _clean_label(current)
        if kept:
            return kept
        return self._next_label(user_id)

    def _purge_overflow(self, user_id: str, *, keep: int) -> None:
        rows = self._conn.execute(
            """
            SELECT id, file_path FROM resumes
            WHERE user_id = ? AND purged = 0 AND file_path IS NOT NULL
            ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
        for row in rows[keep:]:
            self._unlink(row["file_path"])
            self._conn.execute(
                """
                UPDATE resumes
                SET redacted_text = NULL, file_path = NULL, purged = 1
                WHERE id = ?
                """,
                (row["id"],),
            )

    def _blob_for(self, resume_id: str, suffix: str) -> Path:
        if not re.fullmatch(r"[0-9a-f]{32}", resume_id):
            raise ValueError("resume id")
        normalized = (suffix or "").lower()
        if normalized not in _ALLOWED_SUFFIXES:
            raise ValueError("suffix")
        root = self.blob_dir.resolve()
        blob = (root / f"{resume_id}{normalized}").resolve()
        if blob.parent != root:
            raise ValueError("path")
        return blob

    def _unlink(self, path: str | None) -> None:
        if not path:
            return
        root = self.blob_dir.resolve()
        candidate = Path(path)
        if not candidate.is_absolute():
            candidate = root / candidate
        try:
            parent = candidate.parent.resolve()
            parent.relative_to(root)
        except (OSError, ValueError):
            return
        if parent != root and root not in parent.parents:
            return
        try:
            candidate.unlink(missing_ok=True)
        except OSError:
            return
