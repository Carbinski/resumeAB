"""Load resumes and job descriptions. Plain text only for now."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Document:
    text: str
    source_type: str


class UnsupportedInputType(Exception):
    pass


def _load_text(path: Path, kind: str) -> Document:
    if path.suffix != ".txt":
        raise UnsupportedInputType(f"Unsupported {kind} type: {path.suffix}")
    return Document(path.read_text(), "plain")


def load_resume(path: Path) -> Document:
    return _load_text(path, "resume")


def load_job_description(source: Path | str) -> Document:
    if isinstance(source, str):
        return Document(source, "plain")
    return _load_text(source, "job description")


def content_sha256(text: str) -> str:
    """Identifies a document by content, so logs never need the text itself."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
