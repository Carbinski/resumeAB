"""Ask Jev which resume is stronger, once in each left/right order."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from resume_ab.categories import FIT_WITHOUT_ROLE, PROMPTS
from resume_ab.load import Document, content_sha256
from typesafe_sdk import Choice, Noul, TypeSafeClient


@dataclass(frozen=True)
class OrderResult:
    left_sha256: str
    right_sha256: str
    choice: dict
    noul: float  # probability the left resume is stronger
    model: str  # versioned id from the response, not the alias
    categories: dict[str, dict] = field(default_factory=dict)


@dataclass(frozen=True)
class CompareResult:
    first: OrderResult
    second: OrderResult


def build_questions(*, has_role: bool, categories: bool = False) -> dict:
    if has_role:
        choice = "Which resume is the stronger application for the role in `role_description`?"
        noul = (
            "The resume in `resume_left` is a stronger application than the resume in "
            "`resume_right` for the role in `role_description`."
        )
    else:
        choice = "Which resume is stronger?"
        noul = "The resume in `resume_left` is stronger than the resume in `resume_right`."
    dating = " Treat `present_date` as today's date when judging recency and date ranges."
    choice += dating
    noul += dating
    questions: dict = {
        "choice": Choice(instructions=choice, criteria={"left": None, "right": None}),
        "noul": Noul(instructions=noul),
    }
    if categories:
        for category_id, prompt in PROMPTS:
            if category_id == "fit" and not has_role:
                prompt = FIT_WITHOUT_ROLE
            questions[category_id] = Choice(
                instructions=prompt + dating, criteria={"left": None, "right": None}
            )
    return questions


def build_state(
    left: Document, right: Document, role_description: str | None, present_date: date
) -> dict:
    state = {
        "resume_left": left.text,
        "resume_right": right.text,
        "present_date": present_date.isoformat(),
    }
    if role_description is not None:
        state["role_description"] = role_description
    return state


def call_jev(state: dict, questions: dict) -> tuple[str, dict, float, dict[str, dict]]:
    """Returns ``(model_id, choice_payload, noul_probability, category_payloads)``.

    Reads ``TYPESAFE_API_KEY``. Category payloads are empty unless those questions
    were included. Every question still goes out in this single request.
    """
    with TypeSafeClient() as client:
        response = client.system_one(state=state, questions=questions, model="jev-latest")
    if len(response.nouls) != 1:
        raise ValueError("expected one Noul answer")
    choices = {key: value.model_dump() for key, value in response.choices.items()}
    if "choice" in choices:
        choice = choices["choice"]
    elif len(choices) == 1:
        choice = next(iter(choices.values()))
    else:
        raise ValueError("expected a Choice answer")
    noul = next(iter(response.nouls.values()))
    categories = {key: value for key, value in choices.items() if key not in {"choice"}}
    return response.model, choice, noul.noul, categories


def compare_resumes(
    left: Document,
    right: Document,
    role_description: str | None,
    *,
    categories: bool = False,
) -> CompareResult:
    """Runs both orders to expose position bias. Results are left unaggregated on purpose."""
    questions = build_questions(has_role=role_description is not None, categories=categories)
    today = date.today()

    def one_order(shown_left: Document, shown_right: Document) -> OrderResult:
        model, choice, noul, category_payloads = call_jev(
            build_state(shown_left, shown_right, role_description, today), questions
        )
        return OrderResult(
            left_sha256=content_sha256(shown_left.text),
            right_sha256=content_sha256(shown_right.text),
            choice=choice,
            noul=noul,
            model=model,
            categories=category_payloads,
        )

    return CompareResult(first=one_order(left, right), second=one_order(right, left))


def aggregate_result(result: CompareResult) -> float:
    """Probability ``first``'s left resume is stronger, averaged over both orders."""
    return (result.first.noul + (1 - result.second.noul)) / 2


def aggregate_categories(result: CompareResult) -> dict[str, float]:
    """Probability ``first``'s left resume wins each category, averaged over both orders."""
    scores: dict[str, float] = {}
    for category_id, choice in result.first.categories.items():
        other = result.second.categories.get(category_id)
        if other is None:
            continue
        left_when_left = float(choice["probabilities"]["left"])
        left_when_right = float(other["probabilities"]["right"])
        scores[category_id] = (left_when_left + left_when_right) / 2
    return scores


def format_report(left_name: str, right_name: str, result: CompareResult) -> str:
    def one_order(left_file: str, right_file: str, order: OrderResult) -> str:
        probabilities = order.choice["probabilities"]
        return "\n".join(
            [
                f"left: {left_file}",
                f"right: {right_file}",
                f"choice: {order.choice['choice']}",
                f"p(left): {probabilities['left']}",
                f"p(right): {probabilities['right']}",
                f"confidence: {order.choice['confidence']}",
                f"noul: {order.noul}",
            ]
        )

    return (
        one_order(left_name, right_name, result.first)
        + "\n\n"
        + one_order(right_name, left_name, result.second)
        + "\n"
    )
