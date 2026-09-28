"""CLI: ``python -m resume_ab (--compare A B | --matchup FOLDER) [--jd role.txt]``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from resume_ab import stack_rank
from resume_ab.compare import compare_resumes, format_report
from resume_ab.load import LoadError, load_job_description, load_resume
from resume_ab.log import Cache, append_match, build_record
from typesafe_sdk import TypeSafeError


def run_compare(a: Path, b: Path, jd_path: Path | None = None, use_cache: bool = True) -> int:
    try:
        resume_a = load_resume(a)
        resume_b = load_resume(b)
        jd_text = load_job_description(jd_path).text if jd_path else None
        cache = Cache() if use_cache else None
        cached = cache.get(resume_a.text, resume_b.text, jd_text) if cache is not None else None
        result = cached if cached is not None else compare_resumes(resume_a, resume_b, jd_text)
    except (FileNotFoundError, LoadError, TypeSafeError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1

    if cached is not None:
        print(f"Using cached result from {cache.path}", file=sys.stderr)
    print(format_report(str(a), str(b), result))
    if cached is None:
        record = build_record(
            left_name=str(a),
            right_name=str(b),
            left_text=resume_a.text,
            right_text=resume_b.text,
            jd_name=str(jd_path) if jd_path else None,
            jd_text=jd_text,
            result=result,
        )
        if cache is not None:
            cache.put(record)
        else:
            append_match(record)
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
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Call the API instead of reusing results from matches.jsonl",
    )
    args = parser.parse_args(argv)

    jd_path = Path(args.jd) if args.jd else None
    use_cache = not args.no_cache
    if args.matchup:
        return stack_rank.run(Path(args.matchup), jd_path, use_cache)
    a, b = args.compare
    return run_compare(Path(a), Path(b), jd_path, use_cache)


if __name__ == "__main__":
    raise SystemExit(main())
