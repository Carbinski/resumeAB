"""Pick a fixed budget of opponents. Never a round-robin."""

from __future__ import annotations

from dataclasses import dataclass

from resume_ab.cohort import MATCH_BUDGET

# While everyone is still near 1000, Elo distance carries no information.
# Spread across anchor slots instead so the first matches cover weak and strong.
FLAT_RANGE = 80
CROSS_GAP = 150


@dataclass(frozen=True)
class Candidate:
    id: str
    elo: float
    anchor_slot: int | None = None


def select_opponents(
    *,
    self_id: str,
    self_elo: float,
    candidates: list[Candidate],
    already: set[str],
    limit: int = MATCH_BUDGET,
) -> list[str]:
    """Up to ``limit`` opponent ids.

    Two anchors (the weakest slot and the strongest), one clearly weaker
    résumé, one clearly stronger, then the closest remaining ratings.
    """
    pool = [candidate for candidate in candidates if candidate.id != self_id and candidate.id not in already]
    if not pool or limit < 1:
        return []

    picked: list[Candidate] = []
    picked_ids: set[str] = set()

    def add(candidate: Candidate | None) -> None:
        if candidate is None or candidate.id in picked_ids or len(picked) >= limit:
            return
        picked.append(candidate)
        picked_ids.add(candidate.id)

    anchors = sorted(
        (candidate for candidate in pool if candidate.anchor_slot is not None),
        key=lambda candidate: candidate.anchor_slot or 0,
    )
    reals = [candidate for candidate in pool if candidate.anchor_slot is None]
    spread = max(candidate.elo for candidate in pool) - min(candidate.elo for candidate in pool)
    if spread < FLAT_RANGE and len(anchors) >= 2:
        # Hold two seats for other people so a flat ladder still connects them.
        real_slots = min(2, len(reals), max(0, limit - 2))
        for index in _spread_indexes(len(anchors), limit - real_slots):
            add(anchors[index])
        for candidate in reals[:real_slots]:
            add(candidate)
        return [candidate.id for candidate in picked]

    if anchors:
        add(anchors[0])
        add(anchors[-1])

    weaker = [candidate for candidate in pool if candidate.id not in picked_ids and candidate.elo <= self_elo - CROSS_GAP]
    stronger = [candidate for candidate in pool if candidate.id not in picked_ids and candidate.elo >= self_elo + CROSS_GAP]
    add(max(weaker, key=lambda candidate: candidate.elo) if weaker else _extreme(pool, picked_ids, strongest=False))
    add(min(stronger, key=lambda candidate: candidate.elo) if stronger else _extreme(pool, picked_ids, strongest=True))

    nearest = sorted(
        (candidate for candidate in pool if candidate.id not in picked_ids),
        key=lambda candidate: (abs(candidate.elo - self_elo), candidate.anchor_slot is not None),
    )
    for candidate in nearest:
        if len(picked) >= limit:
            break
        add(candidate)
    return [candidate.id for candidate in picked]


def _extreme(pool: list[Candidate], picked_ids: set[str], *, strongest: bool) -> Candidate | None:
    remaining = [candidate for candidate in pool if candidate.id not in picked_ids]
    if not remaining:
        return None
    return max(remaining, key=lambda candidate: candidate.elo) if strongest else min(remaining, key=lambda candidate: candidate.elo)


def _spread_indexes(count: int, limit: int) -> list[int]:
    if count <= limit:
        return list(range(count))
    if limit == 1:
        return [0]
    return [round(offset * (count - 1) / (limit - 1)) for offset in range(limit)]
