"""Append-only match log. Stores hashes and answers, never resume or JD text."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from resume_ab.compare import CompareResult, OrderResult
from resume_ab.load import content_sha256

MATCHES_PATH = Path("matches.jsonl")


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
