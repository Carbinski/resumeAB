"""Ask Jev which resume is stronger, once in each left/right order."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from resume_ab.load import Document, content_sha256
from typesafe_sdk import Choice, Noul, TypeSafeClient


@dataclass(frozen=True)
class OrderResult:
    left_sha256: str
    right_sha256: str
    choice: dict
    noul: float  # probability the left resume is stronger
    model: str  # versioned id from the response, not the alias


@dataclass(frozen=True)
class CompareResult:
    first: OrderResult
    second: OrderResult


def build_questions(*, has_role: bool) -> dict:
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
    return {
        "choice": Choice(instructions=choice, criteria={"left": None, "right": None}),
        "noul": Noul(instructions=noul),
    }


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


def call_jev(state: dict, questions: dict) -> tuple[str, dict, float]:
    """Returns ``(model_id, choice_payload, noul_probability)``. Reads ``TYPESAFE_API_KEY``."""
    with TypeSafeClient() as client:
        response = client.system_one(state=state, questions=questions, model="jev-latest")
    if len(response.choices) != 1 or len(response.nouls) != 1:
        raise ValueError("expected one Choice answer and one Noul answer")
    choice = next(iter(response.choices.values()))
    noul = next(iter(response.nouls.values()))
    return response.model, choice.model_dump(), noul.noul


def compare_resumes(left: Document, right: Document, role_description: str | None) -> CompareResult:
    """Runs both orders to expose position bias. Results are left unaggregated on purpose."""
    questions = build_questions(has_role=role_description is not None)
    today = date.today()

    def one_order(shown_left: Document, shown_right: Document) -> OrderResult:
        model, choice, noul = call_jev(
            build_state(shown_left, shown_right, role_description, today), questions
        )
        return OrderResult(
            left_sha256=content_sha256(shown_left.text),
            right_sha256=content_sha256(shown_right.text),
            choice=choice,
            noul=noul,
            model=model,
        )

    return CompareResult(first=one_order(left, right), second=one_order(right, left))


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
