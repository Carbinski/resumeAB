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
