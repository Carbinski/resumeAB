"""Round-robin every resume in a folder: ``python -m resume_ab.stack_rank folder/ [--jd role.txt]``."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path

from resume_ab.compare import aggregate_result, compare_resumes
from resume_ab.load import Document, LoadError, load_job_description, load_resumes
from resume_ab.log import Cache, append_match, build_record
from resume_ab.rating import fit_elo
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

    def elo_ratings(self) -> list[float]:
        """Elo rating per entry in ``names``, fit to every pair in the matrix at once."""
        observations = [
            (i, j, p)
            for i, row in enumerate(self.matrix)
            for j, p in enumerate(row)
            if i < j and p is not None
        ]
        return fit_elo(len(self.names), observations)


def build_matchups(
    resumes: list[tuple[Path, Document]],
    jd_name: str | None = None,
    jd_text: str | None = None,
    cache: Cache | None = None,
) -> Matchups:
    """Compares every pair (both orders each) and logs each new match to ``matches.jsonl``.

    Pairs already in ``cache`` are reused instead of calling the API; ``None`` disables reuse.
    """
    if len(resumes) < 2:
        raise ValueError(f"need at least two resumes to build a matchup matrix, got {len(resumes)}")

    matrix: list[list[float | None]] = [[None] * len(resumes) for _ in resumes]
    pairs = list(combinations(range(len(resumes)), 2))
    cached_count = 0
    for count, (i, j) in enumerate(pairs, start=1):
        (left_path, left), (right_path, right) = resumes[i], resumes[j]
        label = f"[{count}/{len(pairs)}] {left_path.name} vs {right_path.name}"
        result = cache.get(left.text, right.text, jd_text) if cache is not None else None
        if result is not None:
            cached_count += 1
            print(f"{label} (cached in {cache.path}, skipped API call)", file=sys.stderr)
        else:
            print(label, file=sys.stderr)
            result = compare_resumes(left, right, jd_text)
            record = build_record(
                left_name=str(left_path),
                right_name=str(right_path),
                left_text=left.text,
                right_text=right.text,
                jd_name=jd_name,
                jd_text=jd_text,
                result=result,
            )
            if cache is not None:
                cache.put(record)
            else:
                append_match(record)
        matrix[i][j] = aggregate_result(result)
        matrix[j][i] = 1 - matrix[i][j]

    if cache is not None:
        print(
            f"Reused {cached_count} of {len(pairs)} matchups from {cache.path}; "
            f"made {len(pairs) - cached_count} new comparisons.",
            file=sys.stderr,
        )

    return Matchups(names=[path.name for path, _ in resumes], matrix=matrix)


def format_matchups(matchups: Matchups) -> str:
    """Table of P(row beats column) plus mean and Elo, rows and columns sorted strongest first."""
    order = matchups.ranking()
    elo = matchups.elo_ratings()
    labels = [f"#{rank} {matchups.names[i]}" for rank, i in enumerate(order, start=1)]
    label_width = max(len(label) for label in labels)
    cell_width = 7

    def row(label: str, cells: list[str]) -> str:
        return label.ljust(label_width) + "".join(cell.rjust(cell_width) for cell in cells)

    lines = [row("", [f"#{rank}" for rank in range(1, len(order) + 1)] + ["mean", "elo"])]
    for label, i in zip(labels, order):
        cells = [
            "—" if matchups.matrix[i][j] is None else f"{matchups.matrix[i][j]:.2f}" for j in order
        ]
        lines.append(
            row(label, cells + [f"{matchups.mean_win_probability(i):.2f}", f"{elo[i]:.0f}"])
        )

    return (
        "P(row beats column), averaged over both left/right orders. Sorted by mean.\n"
        "Elo is a Bradley–Terry fit to every pair at once, centered at 1000 "
        "(400 points = 10-to-1 odds).\n\n"
        + "\n".join(lines)
        + "\n"
    )


def run(folder: Path, jd_path: Path | None = None, use_cache: bool = True) -> int:
    try:
        resumes = load_resumes(folder)
        jd_text = load_job_description(jd_path).text if jd_path else None
        cache = Cache() if use_cache else None
        matchups = build_matchups(resumes, str(jd_path) if jd_path else None, jd_text, cache)
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
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Call the API for every pair instead of reusing results from matches.jsonl",
    )
    args = parser.parse_args(argv)
    return run(Path(args.folder), Path(args.jd) if args.jd else None, not args.no_cache)


if __name__ == "__main__":
    raise SystemExit(main())
