"""Round-robin every resume in a folder: ``python -m resume_ab.stack_rank folder/ [--jd role.txt]``."""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path

from rich import box
from rich.console import Console, Group
from rich.table import Table
from rich.text import Text

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
            print(f"{label} (cached in {cache.path})", file=sys.stderr)
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


NAME_SEPARATORS = "_-. "


def short_names(names: list[str]) -> tuple[list[str], str, str]:
    """Drops the prefix and suffix every name shares, cut back to a separator.

    Returns ``(names, prefix, suffix)``. Falls back to the full names if trimming would leave a
    name empty or make two names equal.
    """
    if len(names) < 2:
        return names, "", ""

    prefix = os.path.commonprefix(names)
    prefix = prefix[: max(prefix.rfind(sep) for sep in NAME_SEPARATORS) + 1]

    suffix = os.path.commonprefix([name[::-1] for name in names])[::-1]
    cuts = [i for i in (suffix.find(sep) for sep in NAME_SEPARATORS) if i != -1]
    suffix = suffix[min(cuts) :] if cuts else ""

    trimmed = [name[len(prefix) : len(name) - len(suffix)] for name in names]
    if not all(trimmed) or len(set(trimmed)) < len(names):
        return names, "", ""
    return trimmed, prefix, suffix


def probability_cell(p: float) -> Text:
    return Text(f"{p:.2f}".removeprefix("0"), style=probability_style(p))


def probability_style(p: float) -> str:
    if p >= 0.6:
        return "green"
    if p <= 0.4:
        return "red"
    return "yellow"


def format_matchups(matchups: Matchups) -> Group:
    """Table of P(row beats column) plus mean and Elo, rows and columns sorted strongest first."""
    order = matchups.ranking()
    elo = matchups.elo_ratings()
    names, prefix, suffix = short_names(matchups.names)

    notes = (
        "Each cell is averaged over both left/right orders.\n"
        "Elo is a Bradley–Terry fit to every pair at once, centered at 1000 "
        "(400 points = 10-to-1 odds)."
    )
    trimmed = []
    if prefix:
        trimmed.append(f"prefix {prefix!r}")
    if suffix:
        trimmed.append(f"suffix {suffix!r}")
    if trimmed:
        notes += f"\nNames shown without shared {' and '.join(trimmed)}."

    table = Table(
        title="P(row beats column), sorted by mean",
        box=box.SIMPLE_HEAD,
        show_edge=False,
        collapse_padding=True,
        header_style="bold",
    )
    table.add_column("#", justify="right", no_wrap=True)
    table.add_column("resume", overflow="ellipsis")
    for rank in range(1, len(order) + 1):
        table.add_column(f"#{rank}", justify="right", min_width=3)
    table.add_column("mean", justify="right", style="bold", min_width=3)
    table.add_column("elo", justify="right", style="bold", min_width=4)

    for rank, i in enumerate(order, start=1):
        cells = [
            Text("—", style="dim")
            if (p := matchups.matrix[i][j]) is None
            else probability_cell(p)
            for j in order
        ]
        table.add_row(
            f"#{rank}",
            Text(names[i], no_wrap=True, overflow="ellipsis"),
            *cells,
            probability_cell(matchups.mean_win_probability(i)),
            f"{elo[i]:.0f}",
        )

    return Group(table, Text(notes, style="dim"))


def run(folder: Path, jd_path: Path | None = None, use_cache: bool = True) -> int:
    try:
        resumes = load_resumes(folder)
        jd_text = load_job_description(jd_path).text if jd_path else None
        cache = Cache() if use_cache else None
        matchups = build_matchups(resumes, str(jd_path) if jd_path else None, jd_text, cache)
    except (FileNotFoundError, LoadError, TypeSafeError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1

    console = Console()
    output = format_matchups(matchups)
    if not sys.stdout.isatty():
        natural_width = console.measure(output, options=console.options.update_width(10_000))
        console.size = (max(console.width, natural_width.maximum), console.height)
    console.print(output)
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
