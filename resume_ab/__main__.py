"""CLI: ``python -m resume_ab (--compare A B | --matchup FOLDER) [--jd role.txt]``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from resume_ab import stack_rank
from resume_ab.compare import compare_resumes, format_report
from resume_ab.load import LoadError, load_job_description, load_resume
from resume_ab.log import append_match, build_record
from typesafe_sdk import TypeSafeError


def run_compare(a: Path, b: Path, jd_path: Path | None = None) -> int:
    try:
        resume_a = load_resume(a)
        resume_b = load_resume(b)
        jd_text = load_job_description(jd_path).text if jd_path else None
        result = compare_resumes(resume_a, resume_b, jd_text)
    except (FileNotFoundError, LoadError, TypeSafeError) as error:
        print(error, file=sys.stderr)
        return 1

    print(format_report(str(a), str(b), result))
    append_match(
        build_record(
            left_name=str(a),
            right_name=str(b),
            left_text=resume_a.text,
            right_text=resume_b.text,
            jd_name=str(jd_path) if jd_path else None,
            jd_text=jd_text,
            result=result,
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="resume_ab")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--compare",
        nargs=2,
        metavar=("A", "B"),
        help="Compare two resume files head to head",
    )
    mode.add_argument(
        "--matchup",
        metavar="FOLDER",
        help=(
            "Compare every pair of supported resume files (.txt, .pdf, .docx, .tex) "
            "in FOLDER and print a matchup matrix"
        ),
    )
    parser.add_argument("--jd", metavar="FILE", help="Job description file")
    args = parser.parse_args(argv)

    jd_path = Path(args.jd) if args.jd else None
    if args.matchup:
        return stack_rank.run(Path(args.matchup), jd_path)
    a, b = args.compare
    return run_compare(Path(a), Path(b), jd_path)


if __name__ == "__main__":
    raise SystemExit(main())
