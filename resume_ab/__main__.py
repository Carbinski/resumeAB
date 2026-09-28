"""CLI: ``python -m resume_ab a.txt b.txt [--jd role.txt]``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from resume_ab.compare import compare_resumes, format_report
from resume_ab.load import UnsupportedInputType, load_job_description, load_resume
from resume_ab.log import append_match, build_record
from typesafe_sdk import TypeSafeError


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="resume_ab")
    parser.add_argument("a", help="First resume file")
    parser.add_argument("b", help="Second resume file")
    parser.add_argument("--jd", metavar="FILE", help="Job description file")
    args = parser.parse_args(argv)

    try:
        resume_a = load_resume(Path(args.a))
        resume_b = load_resume(Path(args.b))
        jd_text = load_job_description(Path(args.jd)).text if args.jd else None
        result = compare_resumes(resume_a, resume_b, jd_text)
    except (FileNotFoundError, UnsupportedInputType, TypeSafeError) as error:
        print(error, file=sys.stderr)
        return 1

    print(format_report(args.a, args.b, result))
    append_match(
        build_record(
            left_name=args.a,
            right_name=args.b,
            left_text=resume_a.text,
            right_text=resume_b.text,
            jd_name=args.jd,
            jd_text=jd_text,
            result=result,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
