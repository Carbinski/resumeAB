"""A judge that never calls Jev. Outcomes are a fixed probability."""

from resume_ab.categories import PROMPTS
from resume_ab.compare import CompareResult, OrderResult
from resume_ab.load import Document, content_sha256


class ScriptedJudge:
    def __init__(self, probability: float = 0.55):
        self.probability = probability
        self.calls: list[tuple[str, str, bool]] = []
        self.seen: list[str] = []

    def compare(
        self,
        left: Document,
        right: Document,
        role_description: str | None,
        *,
        categories: bool = False,
    ) -> CompareResult:
        self.calls.append((left.text, right.text, categories))
        self.seen.extend([left.text, right.text])
        probability = self.probability
        return CompareResult(
            first=_order(left.text, right.text, probability, categories),
            second=_order(right.text, left.text, 1 - probability, categories),
        )


def _order(left_text: str, right_text: str, probability: float, categories: bool) -> OrderResult:
    choice = {
        "choice": "left" if probability >= 0.5 else "right",
        "probabilities": {"left": probability, "right": 1 - probability},
        "confidence": abs(2 * probability - 1),
    }
    payloads = {}
    if categories:
        payloads = {category_id: choice for category_id, _prompt in PROMPTS}
    return OrderResult(
        left_sha256=content_sha256(left_text),
        right_sha256=content_sha256(right_text),
        choice=choice,
        noul=probability,
        model="scripted-judge",
        categories=payloads,
    )
