"""Append-only match log. Stores hashes and answers, never resume or JD text."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from resume_ab.compare import CompareResult, OrderResult
from resume_ab.load import content_sha256

MATCHES_PATH = Path("matches.jsonl")

CacheKey = tuple[str, str, str | None]


def _identity(name: str, text: str) -> dict:
    return {"name": Path(name).name, "sha256": content_sha256(text)}


def _order(order: OrderResult) -> dict:
    return {
        "left_sha256": order.left_sha256,
        "choice": order.choice,
        "noul": order.noul,
        "model": order.model,
    }


def build_record(
    *,
    left_name: str,
    right_name: str,
    left_text: str,
    right_text: str,
    jd_name: str | None,
    jd_text: str | None,
    result: CompareResult,
) -> dict:
    return {
        "time": datetime.now(timezone.utc).isoformat(),
        "left": _identity(left_name, left_text),
        "right": _identity(right_name, right_text),
        "jd": _identity(jd_name, jd_text) if jd_name and jd_text is not None else None,
        "orders": [_order(result.first), _order(result.second)],
    }


def append_match(record: dict, path: Path = MATCHES_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def _result_from_record(record: dict) -> CompareResult:
    left, right = record["left"]["sha256"], record["right"]["sha256"]
    first, second = record["orders"]

    def order(logged: dict, right_sha256: str) -> OrderResult:
        return OrderResult(
            left_sha256=logged["left_sha256"],
            right_sha256=right_sha256,
            choice=logged["choice"],
            noul=logged["noul"],
            model=logged["model"],
        )

    return CompareResult(first=order(first, right), second=order(second, left))


class Cache:
    """Index over ``matches.jsonl``; ``put`` appends so the file stays the source of truth."""

    def __init__(self, path: Path = MATCHES_PATH):
        self.path = path
        self._results: dict[CacheKey, CompareResult] = {}
        if path.exists():
            with path.open(encoding="utf-8") as handle:
                for line in handle:
                    if line.strip():
                        self._index(json.loads(line))

    def get(self, left_text: str, right_text: str, jd_text: str | None) -> CompareResult | None:
        """Result for this pair in either left/right order, oriented as asked."""
        left, right = content_sha256(left_text), content_sha256(right_text)
        jd = None if jd_text is None else content_sha256(jd_text)
        if (hit := self._results.get((left, right, jd))) is not None:
            return hit
        if (hit := self._results.get((right, left, jd))) is not None:
            return CompareResult(first=hit.second, second=hit.first)
        return None

    def put(self, record: dict) -> None:
        append_match(record, self.path)
        self._index(record)

    def _index(self, record: dict) -> None:
        jd = record["jd"]["sha256"] if record["jd"] else None
        key = (record["left"]["sha256"], record["right"]["sha256"], jd)
        self._results[key] = _result_from_record(record)
