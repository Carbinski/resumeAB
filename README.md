# resumeAB
Ranking resumes with AB testing via Jev!

## Install

```bash
python -m venv .venv
.venv/bin/python -m pip install -e .
cp .env.example .env  # then set TYPESAFE_API_KEY
```

## Supported formats

Resumes and job descriptions can be `.txt`, `.pdf`, `.docx`, or `.tex`. Each is converted to plain text before comparison, so the judge sees content rather than formatting. Legacy `.doc` files and image-only (scanned) PDFs are not supported.

## Caching

Every comparison is appended to `matches.jsonl`, which doubles as a cache: a pair with the same resume and job description text (in either order) is reused instead of calling the API again. Pass `--no-cache` to force fresh calls.
