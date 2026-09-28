"""Bradley–Terry ratings on the Elo scale, fit to every matchup at once."""

from __future__ import annotations

import math

ELO_CENTER = 1000.0
ELO_SCALE = 400.0  # a 400-point gap means 10-to-1 odds
PRIOR_SD = 400.0  # Elo points; keeps a resume that wins every matchup at p=1.0 finite

Observation = tuple[int, int, float]  # (left, right, P(left beats right))


def fit_elo(
    count: int,
    observations: list[Observation],
    *,
    center: float = ELO_CENTER,
    scale: float = ELO_SCALE,
    prior_sd: float = PRIOR_SD,
    tolerance: float = 1e-9,
    max_steps: int = 100_000,
) -> list[float]:
    """Ratings for players ``0..count-1`` that best explain the soft outcomes in ``observations``.

    Minimizes cross-entropy plus a Gaussian prior centered on ``center``, so the ratings
    average exactly ``center``.
    """
    if count < 1:
        raise ValueError(f"need at least one player to rate, got {count}")

    k = math.log(10) / scale
    precision = 1 / (prior_sd * k) ** 2
    degree = [0] * count
    for left, right, _ in observations:
        degree[left] += 1
        degree[right] += 1
    # 1 / (upper bound on the loss curvature), so plain gradient steps cannot overshoot
    step = 1 / (max(degree) / 2 + precision)

    strength = [0.0] * count  # ratings in natural-log-odds units, relative to ``center``
    for _ in range(max_steps):
        gradient = [-precision * s for s in strength]
        for left, right, p in observations:
            residual = p - 1 / (1 + math.exp(strength[right] - strength[left]))
            gradient[left] += residual
            gradient[right] -= residual
        strength = [s + step * g for s, g in zip(strength, gradient)]
        if max(abs(g) for g in gradient) < tolerance:
            break

    return [center + s / k for s in strength]
