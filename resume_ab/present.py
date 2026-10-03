"""JSON shapes the website already expects, plus the public band view."""

from __future__ import annotations

import math

from resume_ab.cohort import (
    LEVEL_LABELS,
    INDUSTRY_LABELS,
    MATCH_BUDGET,
    Neighbor,
    Person,
    band_label,
    histogram,
    neighbors_for,
    overall_pool,
    rounded_percentile,
)
from resume_ab.compare import CompareResult, aggregate_categories, aggregate_result
from resume_ab.store import Resume, Store


def version_payload(store: Store, resume: Resume) -> dict:
    level = resume.level or "intern"
    memberships = store.memberships_for(resume.id)
    overall = memberships.get(overall_pool(level))
    people = _people(store, overall_pool(level))
    elo = overall.elo if overall else 1000.0
    status = overall.status if overall else "placing"
    placed = status in {"provisional", "rated"}
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
        "id": resume.id,
        "level": level,
        "label": resume.label or "Draft",
        "fileName": resume.file_name or "resume",
        "uploadedAt": resume.created_at,
        "note": resume.note,
        "ratings": {
            "overall": round(elo),
            "ai": _role_elo(memberships, level, "ai"),
            "cloud": _role_elo(memberships, level, "cloud"),
            "fullstack": _role_elo(memberships, level, "fullstack"),
        },
        "categories": {
            category_id: round(score)
            for category_id, score in store.category_scores(resume.id).items()
        },
        "roleStatus": {
            role: _role_state(memberships, level, role) for role in ("ai", "cloud", "fullstack")
        },
        "standing": {
            "status": status,
            "message": overall.error if overall and overall.error else None,
            "band": band_label(elo),
            "percentile": rounded_percentile(elo, others) if placed else None,
            "histogram": histogram(people, level),
            "neighbors": [_neighbor(card) for card in cards],
            "widened": widened,
            "matchesPlayed": overall.match_count if overall else 0,
            "matchBudget": MATCH_BUDGET,
        },
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
    p_b = 1 - aggregate_result(result)
    categories = []
    left_overall = version_payload(store, left)["ratings"]["overall"]
    for category_id, p_left in aggregate_categories(result).items():
        p_category_b = 1 - p_left
        elo_b = _elo_from_base(left_overall, p_category_b)
        categories.append(
            {
                "id": category_id,
                "pB": p_category_b,
                "eloA": left_overall,
                "eloB": round(elo_b),
            }
        )
    ratings_a = version_payload(store, left)["ratings"]
    ratings_b = version_payload(store, right)["ratings"]
    elo_a = ratings_a.get(role) if ratings_a.get(role) is not None else ratings_a["overall"]
    elo_b = ratings_b.get(role) if ratings_b.get(role) is not None else ratings_b["overall"]
    return {
        "a": version_payload(store, left),
        "b": version_payload(store, right),
        "role": role,
        "pB": p_b,
        "eloA": elo_a,
        "eloB": elo_b,
        "orders": [
            _order_payload("a", result.first),
            _order_payload("b", result.second),
        ],
        "categories": categories,
    }


def user_payload(user) -> dict:
    return {
        "email": user.email,
        "nameOnResume": user.name_on_resume,
        "level": user.level,
        "industry": user.industry,
        "company": user.company,
    }


def _people(store: Store, pool_id: str) -> list[Person]:
    people = []
    for row in store.pool_rows(pool_id):
        people.append(
            Person(
                id=row["id"],
                elo=row["elo"],
                level=row["level"] or "",
                industry=row["industry"] or "",
                company=row["company"],
                synthetic=bool(row["is_synthetic"]),
                tombstoned=bool(row["tombstoned"]),
                placed=row["status"] in {"provisional", "rated"},
            )
        )
    return people


def _role_state(memberships, level: str, role: str) -> dict | None:
    membership = memberships.get(f"{level}:{role}")
    if membership is None:
        return None
    return {"status": membership.status, "message": membership.error}


def _role_elo(memberships, level: str, role: str) -> int | None:
    membership = memberships.get(f"{level}:{role}")
    if membership is None or membership.status not in {"provisional", "rated"}:
        return None
    return round(membership.elo)


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
