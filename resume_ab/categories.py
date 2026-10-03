"""The six quality questions. Wording matches ``web/lib/categories.ts``."""

from __future__ import annotations

# (id, prompt). Role fit has a second wording when no job description is in the state.
PROMPTS: tuple[tuple[str, str], ...] = (
    ("impact", "Which resume shows more concrete, measurable impact from the candidate's work?"),
    ("depth", "Which resume shows deeper technical skill on harder problems?"),
    (
        "leadership",
        "Which resume shows stronger leadership and ownership of outcomes?",
    ),
    ("fit", "Which resume is a closer match to the role in `role_description`?"),
    ("trajectory", "Which resume shows stronger growth and more recent, relevant work?"),
    ("clarity", "Which resume communicates its strengths more clearly?"),
)

FIT_WITHOUT_ROLE = "Which resume reads as a closer match to a strong internship or new-grad role?"

ROLE_DESCRIPTIONS = {
    "ai": (
        "AI and machine learning engineer, internship or new grad. "
        "Model work, data pipelines, evaluation, and taking research into production."
    ),
    "cloud": (
        "Cloud and infrastructure engineer, internship or new grad. "
        "Reliability, deploy tooling, cost, and operating software at scale."
    ),
    "fullstack": (
        "Full-stack product engineer, internship or new grad. "
        "Work across the interface, the API, and the data layer."
    ),
}
