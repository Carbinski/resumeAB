"""JSON shapes the website already expects, plus the public band view."""

from __future__ import annotations

import math

from resume_ab.cohort import (
    LEVEL_LABELS,
    INDUSTRY_LABELS,
    MATCH_BUDGET,
    ROLE_IDS,
    Neighbor,
    Person,
    band_label,
    histogram,
    neighbors_for,
    overall_pool,
    rounded_percentile,
)
from resume_ab.compare import CompareResult, aggregate_categories, aggregate_result
from resume_ab.store import Membership, Resume, Store

_PLACED = frozenset({"provisional", "rated"})


def version_payload(store: Store, resume: Resume) -> dict:
    level = resume.level or "intern"
    memberships = store.memberships_for(resume.id)
    pool = overall_pool(level)
    overall = memberships.get(pool)
    elo = overall.elo if overall else 1000.0
    placed = (overall.status if overall else "placing") in _PLACED
    role_ratings, role_status = _roles(memberships, level)
    return {
        "id": resume.id,
        "level": level,
        "industry": resume.industry or "",
        "company": resume.company,
        "label": resume.label or "Draft",
        "fileName": resume.file_name or "resume",
        "uploadedAt": resume.created_at,
        "note": resume.note,
        "ratings": {"overall": round(elo), **role_ratings},
        "categories": {
            category_id: round(score)
            for category_id, score in store.category_scores(resume.id).items()
        },
        "roleStatus": role_status,
        "standing": _standing(
            resume,
            overall,
            _people(store, pool),
            level=level,
            elo=elo,
            placed=placed,
        ),
    }


def comparison_payload(
    store: Store,
    left: Resume,
    right: Resume,
    result: CompareResult,
    *,
    role: str,
) -> dict:
    """``left`` is résumé A and ``right`` is résumé B, matching the website."""
    a = version_payload(store, left)
    b = version_payload(store, right)
    left_overall = a["ratings"]["overall"]
    return {
        "a": a,
        "b": b,
        "role": role,
        "pB": 1 - aggregate_result(result),
        "eloA": _shown_elo(a["ratings"], role),
        "eloB": _shown_elo(b["ratings"], role),
        "orders": [
            _order_payload("a", result.first),
            _order_payload("b", result.second),
        ],
        "categories": [
            _category_duel(category_id, p_left, left_overall)
            for category_id, p_left in aggregate_categories(result).items()
        ],
    }


def user_payload(user) -> dict:
    return {
        "email": user.email,
        "nameOnResume": user.name_on_resume,
        "level": user.level,
        "industry": user.industry,
        "company": user.company,
        "focus": user.focus or "",
    }


def _people(store: Store, pool_id: str) -> list[Person]:
    return [_person(row) for row in store.pool_rows(pool_id)]


def _person(row) -> Person:
    return Person(
        id=row["id"],
        elo=row["elo"],
        level=row["level"] or "",
        industry=row["industry"] or "",
        company=row["company"],
        synthetic=bool(row["is_synthetic"]),
        tombstoned=bool(row["tombstoned"]),
        placed=row["status"] in _PLACED,
    )


def _roles(memberships, level: str) -> tuple[dict[str, int | None], dict[str, dict | None]]:
    ratings: dict[str, int | None] = {}
    status: dict[str, dict | None] = {}
    for role in ROLE_IDS:
        membership = memberships.get(f"{level}:{role}")
        status[role] = _role_state(membership)
        ratings[role] = _role_elo(membership)
    return ratings, status


def _role_state(membership: Membership | None) -> dict | None:
    if membership is None:
        return None
    return {"status": membership.status, "message": membership.error}


def _role_elo(membership: Membership | None) -> int | None:
    if membership is None or membership.status not in _PLACED:
        return None
    return round(membership.elo)


def _standing(
    resume: Resume,
    overall: Membership | None,
    people: list[Person],
    *,
    level: str,
    elo: float,
    placed: bool,
) -> dict:
    others = [
        person.elo
        for person in people
        if person.placed and not person.synthetic and not person.tombstoned and person.id != resume.id
    ]
    me = Person(
        id=resume.id,
        elo=elo,
        level=level,
        industry=resume.industry or "other",
        company=resume.company,
        placed=placed,
    )
    cards, widened = neighbors_for(me, people) if placed else ([], False)
    return {
        "status": overall.status if overall else "placing",
        "message": overall.error if overall and overall.error else None,
        "band": band_label(elo),
        "percentile": rounded_percentile(elo, others) if placed else None,
        "histogram": histogram(people, level),
        "neighbors": [_neighbor(card) for card in cards],
        "widened": widened,
        "matchesPlayed": overall.match_count if overall else 0,
        "matchBudget": MATCH_BUDGET,
    }


def _shown_elo(ratings: dict, role: str):
    """A track that has not been placed stays missing. Overall is not a substitute."""
    return ratings.get(role)


def _category_duel(category_id: str, p_left: float, left_overall: float) -> dict:
    p_b = 1 - p_left
    return {
        "id": category_id,
        "pB": p_b,
        "eloA": left_overall,
        "eloB": round(_elo_from_base(left_overall, p_b)),
    }


def _neighbor(card: Neighbor) -> dict:
    return {
        "company": card.company,
        "level": card.level,
        "levelLabel": LEVEL_LABELS.get(card.level, card.level),
        "industry": card.industry,
        "industryLabel": INDUSTRY_LABELS.get(card.industry, card.industry),
        "relation": card.relation,
    }


def _order_payload(left: str, order) -> dict:
    probabilities = order.choice.get("probabilities") or {}
    left_p = float(probabilities.get("left", order.noul))
    right_p = float(probabilities.get("right", 1 - left_p))
    choice = order.choice.get("choice")
    if choice not in {"left", "right"}:
        choice = "left" if left_p >= right_p else "right"
    confidence = order.choice.get("confidence")
    if confidence is None:
        confidence = abs(left_p - right_p)
    return {
        "left": left,
        "choice": choice,
        "probabilities": {"left": left_p, "right": right_p},
        "confidence": confidence,
        "noul": order.noul,
        "model": order.model,
    }


def _elo_from_base(base: float, probability: float) -> float:
    clipped = min(0.98, max(0.02, probability))
    return base + 400 * math.log10(clipped / (1 - clipped))
