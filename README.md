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

## Website

The site in `web/` talks to a small API in this package. Accounts, résumé files, and ratings live in `data/` (gitignored). Redaction of name, email, phone, URL, and street address happens locally before a résumé is stored or sent to Jev.

```bash
python -m resume_ab.api          # http://127.0.0.1:8000
cd web && npm install && npm run dev
```

Set `TYPESAFE_API_KEY` in `.env` before uploading. Each published résumé is compared with at most eight opponents in its intern or new-grad pool, in both reading orders. Synthetic calibration résumés are seeded automatically and never appear on the public board.

Every upload appends the extracted text and the redacted text to `data/logs/resume-text.log`. That file stays on the API machine and is not copied to the process output. The browser never receives it.

## Caching

Every comparison is appended to `matches.jsonl`, which doubles as a cache: a pair with the same resume and job description text (in either order) is reused instead of calling the API again. Pass `--no-cache` to force fresh calls.

A proposal for deploy, the signed-in page, and the next tracks is in [docs/next-steps.md](docs/next-steps.md).
