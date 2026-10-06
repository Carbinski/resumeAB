"""Judge interface. Production calls Jev. Tests pass a scripted stand-in."""

from __future__ import annotations

from typing import Protocol

from resume_ab.compare import CompareResult, compare_resumes
from resume_ab.load import Document


class Judge(Protocol):
    def compare(
        self,
        left: Document,
        right: Document,
        role_description: str | None,
        *,
        categories: bool = False,
    ) -> CompareResult: ...


class JevJudge:
    """Two model calls per comparison (both reading orders), via ``compare_resumes``."""

    def compare(
        self,
        left: Document,
        right: Document,
        role_description: str | None,
        *,
        categories: bool = False,
    ) -> CompareResult:
        return compare_resumes(left, right, role_description, categories=categories)
