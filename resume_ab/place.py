"""Play a capped set of matchups and turn them into a rating."""

from __future__ import annotations

import json
import logging
import math

from resume_ab.categories import ROLE_DESCRIPTIONS
from resume_ab.cohort import MATCH_BUDGET, overall_pool
from resume_ab.compare import (
    CompareResult,
    OrderResult,
    aggregate_categories,
    aggregate_result,
)
from resume_ab.judge import Judge
from resume_ab.load import Document
from resume_ab.schedule import Candidate, select_opponents
from resume_ab.store import Resume, Store

log = logging.getLogger(__name__)

EARLY_STOP_GAP = 0.08
EARLY_STOP_AFTER = 4
PROVISIONAL_AFTER = 2
# An anchor within this many Elo points is close enough to calibrate categories.
# Farther than this, the middle calibration anchor is the opponent instead.
CATEGORY_ANCHOR_GAP = 150


def place_resume(store: Store, judge: Judge, resume_id: str, pool_id: str) -> None:
    """Rate ``resume_id`` inside ``pool_id``. Safe to call again: finished pairs are skipped."""
    resume = store.get_resume(resume_id)
    if resume is None or resume.redacted_text is None or resume.level is None:
        store.set_status(resume_id, pool_id, "error", "This résumé's text is no longer stored.")
        return

    role_description = None
    if ":" in pool_id:
        role_description = ROLE_DESCRIPTIONS.get(pool_id.split(":", 1)[1])
    store.ensure_pool_anchors(pool_id, resume.level)
    store.ensure_membership(resume_id, pool_id)

    try:
        _play(store, judge, resume_id, pool_id, role_description)
    except Exception as error:
        log.warning("placement failed for %s: %s", resume_id, type(error).__name__)
        store.set_status(resume_id, pool_id, "error", _safe_message(error, resume.redacted_text))
        return

    if ":" not in pool_id:
        try:
            score_categories(store, judge, resume_id, pool_id)
        except Exception as error:
            log.warning("category scoring failed for %s: %s", resume_id, type(error).__name__)


def score_categories(store: Store, judge: Judge, resume_id: str, pool_id: str | None = None) -> None:
    """Category Elos for one published résumé.

    Later versions move off the previous résumé's scores. The first version
    is compared once with a calibration anchor in ``pool_id``.
    """
    resume = store.get_resume(resume_id)
    if resume is None or resume.user_id is None or resume.redacted_text is None:
        return
    if store.has_categories(resume_id):
        return

    previous = store.previous_published(resume.user_id, resume.created_at)
    if previous is not None:
        if previous.redacted_text is None:
            return
        result = run_compare(
            store,
            judge,
            resume,
            previous,
            role_description=None,
            pool_key="categories",
            categories=True,
        )
        scores = store.category_scores(previous.id)
        membership = store.memberships_for(previous.id).get(previous.level or "")
        fallback = membership.elo if membership else 1000.0
        _store_categories(store, resume_id, result, fallback, scores)
        return

    if pool_id is None:
        if resume.level is None:
            return
        pool_id = overall_pool(resume.level)
    _score_against_anchor(store, judge, resume, pool_id)


def _store_categories(
    store: Store,
    resume_id: str,
    result: CompareResult,
    base: float,
    prior: dict[str, float] | None = None,
) -> None:
    scores = prior or {}
    for category_id, probability in aggregate_categories(result).items():
        store.set_category(resume_id, category_id, _elo_after(scores.get(category_id, base), probability))


def _score_against_anchor(store: Store, judge: Judge, resume: Resume, pool_id: str) -> None:
    membership = store.memberships_for(resume.id).get(pool_id)
    base = membership.elo if membership else 1000.0
    anchors = [candidate for candidate in store.candidates(pool_id) if candidate.anchor_slot is not None]
    chosen = _select_category_anchor(anchors, base)
    anchor = store.get_resume(chosen.id) if chosen is not None else None
    if anchor is None or anchor.redacted_text is None:
        raise ValueError("No calibration résumé is available for category scores.")
    result = run_compare(
        store,
        judge,
        resume,
        anchor,
        role_description=None,
        pool_key="categories",
        categories=True,
    )
    _store_categories(store, resume.id, result, base)


def _select_category_anchor(anchors: list[Candidate], elo: float) -> Candidate | None:
    """Nearest anchor inside CATEGORY_ANCHOR_GAP, else the middle calibration slot."""
    ranked = sorted(
        (candidate for candidate in anchors if candidate.anchor_slot is not None),
        key=lambda candidate: candidate.anchor_slot or 0,
    )
    if not ranked:
        return None
    middle = ranked[len(ranked) // 2]
    middle_slot = middle.anchor_slot or 0
    nearest = min(
        ranked,
        key=lambda candidate: (
            abs(candidate.elo - elo),
            abs((candidate.anchor_slot or 0) - middle_slot),
            candidate.anchor_slot or 0,
        ),
    )
    if abs(nearest.elo - elo) <= CATEGORY_ANCHOR_GAP:
        return nearest
    return middle


def run_compare(
    store: Store,
    judge: Judge,
    left: Resume,
    right: Resume,
    *,
    role_description: str | None,
    pool_key: str,
    categories: bool,
) -> CompareResult:
    if left.redacted_text is None or right.redacted_text is None:
        raise ValueError("That version's text has been removed.")
    cached = store.comparison_payload(pool_key, left.content_sha256, right.content_sha256)
    if cached is not None:
        return _load_result(cached)
    flipped = store.comparison_payload(pool_key, right.content_sha256, left.content_sha256)
    if flipped is not None:
        loaded = _load_result(flipped)
        return CompareResult(first=loaded.second, second=loaded.first)

    result = judge.compare(
        Document(left.redacted_text, left.source_type or "plain"),
        Document(right.redacted_text, right.source_type or "plain"),
        role_description,
        categories=categories,
    )
    store.save_comparison(pool_key, left.content_sha256, right.content_sha256, _dump_result(result))
    return result


def _play(
    store: Store,
    judge: Judge,
    resume_id: str,
    pool_id: str,
    role_description: str | None,
) -> None:
    resume = store.get_resume(resume_id)
    assert resume is not None
    outcomes: list[float] = []
    attempted: set[str] = set()

    while True:
        membership = store.memberships_for(resume_id)[pool_id]
        already = store.played_with(pool_id, resume_id)
        if len(already) >= MATCH_BUDGET:
            break
        chosen = select_opponents(
            self_id=resume_id,
            self_elo=membership.elo,
            candidates=store.candidates(pool_id),
            already=already | attempted,
            limit=MATCH_BUDGET - len(already),
        )
        if not chosen:
            break
        opponent_id = chosen[0]
        attempted.add(opponent_id)
        opponent = store.get_resume(opponent_id)
        if opponent is None or opponent.redacted_text is None:
            continue
        result = run_compare(
            store,
            judge,
            resume,
            opponent,
            role_description=role_description,
            pool_key=pool_id,
            categories=False,
        )
        probability = aggregate_result(result)
        store.save_match(
            pool_id=pool_id,
            left_id=resume.id,
            left_sha=resume.content_sha256,
            right_id=opponent.id,
            right_sha=opponent.content_sha256,
            p_left=probability,
            model=result.first.model,
        )
        store.refit(pool_id)
        outcomes.append(probability)
        played = len(store.played_with(pool_id, resume_id))
        if played >= PROVISIONAL_AFTER and membership.status == "placing":
            store.set_status(resume_id, pool_id, "provisional")
        if (
            played >= EARLY_STOP_AFTER
            and len(outcomes) >= 3
            and max(outcomes[-3:]) - min(outcomes[-3:]) <= EARLY_STOP_GAP
        ):
            break

    store.refit(pool_id)
    store.set_status(resume_id, pool_id, "rated", None)


def _elo_after(base: float, probability: float) -> float:
    clipped = min(0.98, max(0.02, probability))
    return base + 400 * math.log10(clipped / (1 - clipped))


def _safe_message(_error: Exception, _text: str | None) -> str:
    """Client-visible placement errors stay generic so résumé text cannot leak."""
    return "The judge could not score this résumé."


def _dump_result(result: CompareResult) -> str:
    def order(item: OrderResult) -> dict:
        return {
            "left_sha256": item.left_sha256,
            "right_sha256": item.right_sha256,
            "choice": item.choice,
            "noul": item.noul,
            "model": item.model,
            "categories": item.categories,
        }

    return json.dumps({"first": order(result.first), "second": order(result.second)})


def _load_result(payload: str) -> CompareResult:
    raw = json.loads(payload)

    def order(item: dict) -> OrderResult:
        return OrderResult(
            left_sha256=item["left_sha256"],
            right_sha256=item["right_sha256"],
            choice=item["choice"],
            noul=item["noul"],
            model=item["model"],
            categories=item.get("categories") or {},
        )

    return CompareResult(first=order(raw["first"]), second=order(raw["second"]))
