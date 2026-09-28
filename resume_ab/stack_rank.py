"""Round-robin every resume in a folder: ``python -m resume_ab.stack_rank folder/ [--jd role.txt]``."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path

from resume_ab.compare import aggregate_result, compare_resumes
from resume_ab.load import Document, LoadError, load_job_description, load_resumes
from resume_ab.log import append_match, build_record
from typesafe_sdk import TypeSafeError


@dataclass(frozen=True)
class Matchups:
    names: list[str]
    matrix: list[list[float | None]]  # matrix[i][j] = P(names[i] beats names[j]); diagonal is None

    def mean_win_probability(self, i: int) -> float:
        opponents = [p for p in self.matrix[i] if p is not None]
        return sum(opponents) / len(opponents)

    def ranking(self) -> list[int]:
        """Indices into ``names``, strongest first."""
        return sorted(range(len(self.names)), key=self.mean_win_probability, reverse=True)


def build_matchups(
    resumes: list[tuple[Path, Document]],
    jd_name: str | None = None,
    jd_text: str | None = None,
) -> Matchups:
    """Compares every pair (both orders each) and logs each match to ``matches.jsonl``."""
    if len(resumes) < 2:
        raise ValueError(f"need at least two resumes to build a matchup matrix, got {len(resumes)}")

    matrix: list[list[float | None]] = [[None] * len(resumes) for _ in resumes]
    pairs = list(combinations(range(len(resumes)), 2))
    for count, (i, j) in enumerate(pairs, start=1):
        (left_path, left), (right_path, right) = resumes[i], resumes[j]
        print(f"[{count}/{len(pairs)}] {left_path.name} vs {right_path.name}", file=sys.stderr)
        result = compare_resumes(left, right, jd_text)
        append_match(
            build_record(
                left_name=str(left_path),
                right_name=str(right_path),
                left_text=left.text,
                right_text=right.text,
                jd_name=jd_name,
                jd_text=jd_text,
                result=result,
            )
        )
        matrix[i][j] = aggregate_result(result)
        matrix[j][i] = 1 - matrix[i][j]

    return Matchups(names=[path.name for path, _ in resumes], matrix=matrix)


def format_matchups(matchups: Matchups) -> str:
    """Table of P(row beats column), rows and columns both sorted strongest first."""
    order = matchups.ranking()
    labels = [f"#{rank} {matchups.names[i]}" for rank, i in enumerate(order, start=1)]
    label_width = max(len(label) for label in labels)
    cell_width = 7

    def row(label: str, cells: list[str]) -> str:
        return label.ljust(label_width) + "".join(cell.rjust(cell_width) for cell in cells)

    lines = [row("", [f"#{rank}" for rank in range(1, len(order) + 1)] + ["mean"])]
    for label, i in zip(labels, order):
        cells = [
            "—" if matchups.matrix[i][j] is None else f"{matchups.matrix[i][j]:.2f}" for j in order
        ]
        lines.append(row(label, cells + [f"{matchups.mean_win_probability(i):.2f}"]))

    return (
        "P(row beats column), averaged over both left/right orders. Sorted by mean.\n\n"
        + "\n".join(lines)
        + "\n"
    )


def run(folder: Path, jd_path: Path | None = None) -> int:
    try:
        resumes = load_resumes(folder)
        jd_text = load_job_description(jd_path).text if jd_path else None
        matchups = build_matchups(resumes, str(jd_path) if jd_path else None, jd_text)
    except (FileNotFoundError, LoadError, TypeSafeError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1

    print(format_matchups(matchups))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="resume_ab.stack_rank")
    parser.add_argument(
        "folder", help="Folder containing supported resume files (.txt, .pdf, .docx, .tex)"
    )
    parser.add_argument("--jd", metavar="FILE", help="Job description file")
    args = parser.parse_args(argv)
    return run(Path(args.folder), Path(args.jd) if args.jd else None)


if __name__ == "__main__":
    raise SystemExit(main())
