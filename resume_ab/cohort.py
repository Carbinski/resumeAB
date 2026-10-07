"""Levels, industries, Elo bands, and who is allowed to appear around a person."""

from __future__ import annotations

from dataclasses import dataclass

LEVELS = ("intern", "newgrad")
LEVEL_LABELS = {"intern": "Intern", "newgrad": "New grad"}

INDUSTRIES = (
    "aerospace",
    "defense",
    "software",
    "robotics",
    "consulting",
    "finance",
    "biotech",
    "healthcare",
    "manufacturing",
    "automation",
)
INDUSTRY_LABELS = {
    "aerospace": "Aerospace",
    "defense": "Defense",
    "software": "Software",
    "robotics": "Robotics",
    "consulting": "Consulting",
    "finance": "Finance",
    "biotech": "Biotech",
    "healthcare": "Healthcare",
    "manufacturing": "Manufacturing",
    "automation": "Automation",
}

# (inclusive lower bound, exclusive upper bound, label). The last band is open.
BANDS: tuple[tuple[float, float, str], ...] = (
    (float("-inf"), 900, "Under 900"),
    (900, 1000, "900–1000"),
    (1000, 1100, "1000–1100"),
    (1100, 1250, "1100–1250"),
    (1250, float("inf"), "1250+"),
)

MATCH_BUDGET = 8
INDUSTRY_COHORT = 3
NEIGHBOR_LIMIT = 5
ROLE_IDS = (
    "ai",
    "cloud",
    "fullstack",
    "embedded",
    "mechanical",
    "flight",
    "devices",
    "biodata",
)
FOCUS_IDS = ("cs", "mee", "bme")
# Industry is the kind of company. Focus is the degree family, suggested once
# and then left to the person. These industries hire across the three groups.
_FOCUS_FOR_INDUSTRY = {
    "software": "cs",
    "aerospace": "mee",
    "manufacturing": "mee",
    "automation": "mee",
    "biotech": "bme",
    "healthcare": "bme",
}


def suggested_focus(industry: str) -> str:
    """A starting focus for an industry, or empty when they should pick."""
    return _FOCUS_FOR_INDUSTRY.get(industry, "")


def overall_pool(level: str) -> str:
    return level


def role_pool(level: str, role: str) -> str:
    return f"{level}:{role}"


def band_index(elo: float) -> int:
    for index, (lower, upper, _) in enumerate(BANDS):
        if lower <= elo < upper:
            return index
    return len(BANDS) - 1


def band_label(elo: float) -> str:
    return BANDS[band_index(elo)][2]


def rounded_percentile(elo: float, others: list[float]) -> float | None:
    """Share of ``others`` strictly below ``elo``, rounded to the nearest 5%."""
    if not others:
        return None
    raw = sum(1 for score in others if score < elo) / len(others)
    return round(raw * 20) / 20


@dataclass(frozen=True)
class Person:
    id: str
    elo: float
    level: str
    industry: str
    company: str | None = None
    synthetic: bool = False
    tombstoned: bool = False
    placed: bool = True


@dataclass(frozen=True)
class Neighbor:
    company: str | None
    level: str
    industry: str
    relation: str  # same | above | below


def neighbors_for(person: Person, people: list[Person]) -> tuple[list[Neighbor], bool]:
    """Anonymous cards at the same level.

    Industry is an exact match. When fewer than three other real résumés share
    that industry, the row widens to the whole level. Company is shown whenever
    the person typed one.
    """
    others = [
        candidate
        for candidate in people
        if candidate.id != person.id
        and not candidate.synthetic
        and not candidate.tombstoned
        and candidate.placed
        and candidate.level == person.level
    ]
    industry_peers = [candidate for candidate in others if candidate.industry == person.industry]
    widened = len(industry_peers) < INDUSTRY_COHORT
    pool = others if widened else industry_peers
    own_band = band_index(person.elo)
    nearby = [
        candidate
        for candidate in pool
        if abs(band_index(candidate.elo) - own_band) <= 1
    ]
    nearby.sort(
        key=lambda candidate: (
            abs(band_index(candidate.elo) - own_band),
            abs(candidate.elo - person.elo),
        )
    )
    cards = [
        Neighbor(
            company=candidate.company or None,
            level=candidate.level,
            industry=candidate.industry,
            relation=_relation(band_index(candidate.elo) - own_band),
        )
        for candidate in nearby[:NEIGHBOR_LIMIT]
    ]
    return cards, widened


def _relation(band_delta: int) -> str:
    if band_delta > 0:
        return "above"
    if band_delta < 0:
        return "below"
    return "same"


def histogram(people: list[Person], level: str) -> list[dict]:
    counts = [0] * len(BANDS)
    for person in people:
        if person.synthetic or person.tombstoned or not person.placed or person.level != level:
            continue
        counts[band_index(person.elo)] += 1
    return [
        {"id": label.lower().replace(" ", "-"), "label": label, "count": count}
        for count, (_, _, label) in zip(counts, BANDS)
    ]
