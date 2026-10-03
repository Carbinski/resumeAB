"""Strip contact details from résumé text before it is stored or judged.

This is a local pass: no model call, no network. It removes the name the
account holder typed, emails, phone numbers, URLs, and street addresses.
Employers, schools, titles, and bullets stay, because the judge and the
public card both need them.
"""

from __future__ import annotations

import re

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(
    r"(?<!\w)(?:"
    r"\+\d{1,3}[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}"
    r"|\(\d{3}\)\s*\d{3}[\s.\-]?\d{4}"
    r"|\d{3}[\s.\-]\d{3}[\s.\-]\d{4}"
    r"|\b\d{10}\b"
    r")(?!\w)"
)
_URL = re.compile(
    r"(?i)(?:https?://|www\.)\S+|\b(?:linkedin\.com|github\.com|gitlab\.com)/\S+"
)
_MAILTO = re.compile(r"(?i)mailto:\S+")
_STREET = re.compile(
    r"(?im)^[^\n]*\b\d{1,6}\s+[A-Za-z0-9.'\-]+\s+"
    r"(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl)\b[^\n]*$"
)
_STATES = (
    "AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|"
    "MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY"
)
_ZIP_AFTER_STATE = re.compile(rf"\b({_STATES})\s+\d{{5}}(?:-\d{{4}})?\b")
_NAME_STOP = {
    "software",
    "engineer",
    "engineering",
    "intern",
    "internship",
    "developer",
    "development",
    "resume",
    "résumé",
    "student",
    "university",
    "college",
    "science",
    "computer",
    "machine",
    "learning",
    "data",
    "product",
    "full",
    "stack",
    "cloud",
    "research",
    "summary",
    "experience",
    "education",
    "skills",
    "project",
    "projects",
    "san",
    "new",
    "los",
    "city",
    "york",
    "francisco",
    "backend",
    "frontend",
    "analyst",
    "manager",
}


def redact(text: str, *, name: str | None = None) -> str:
    """Return ``text`` with contact details removed."""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    if name and name.strip():
        cleaned = _strip_known_name(cleaned, name.strip())
    cleaned = _MAILTO.sub("", cleaned)
    cleaned = _EMAIL.sub("", cleaned)
    cleaned = _URL.sub("", cleaned)
    cleaned = _PHONE.sub("", cleaned)
    cleaned = _ZIP_AFTER_STATE.sub(r"\1", cleaned)
    kept = [line for line in cleaned.split("\n") if not _STREET.match(line)]
    cleaned = "\n".join(kept)
    cleaned = _drop_leading_name(cleaned)
    return _cleanup(cleaned)


def _strip_known_name(text: str, name: str) -> str:
    text = re.sub(rf"\b{re.escape(name)}\b", "", text, flags=re.IGNORECASE)
    parts = name.split()
    if len(parts) >= 2:
        flipped = f"{parts[-1]}, {' '.join(parts[:-1])}"
        text = re.sub(rf"\b{re.escape(flipped)}\b", "", text, flags=re.IGNORECASE)
    return text


def _looks_like_name(line: str) -> bool:
    words = line.strip().split()
    if "," in line or not 2 <= len(words) <= 3:
        return False
    if any(character.isdigit() for character in line):
        return False
    if any(len(word.strip(".")) == 2 and word.strip(".").isupper() for word in words):
        return False
    for word in words:
        token = word.strip(".,").lower()
        if token in _NAME_STOP:
            return False
        bare = word.strip(".")
        if re.fullmatch(r"[A-Za-z]", bare):
            continue
        if not re.fullmatch(r"[A-Z][A-Za-z'\-]+", word.strip(",")):
            return False
    return True


def _drop_leading_name(text: str) -> str:
    lines = text.split("\n")
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        if _looks_like_name(line.strip()):
            lines[index] = ""
        break
    return "\n".join(lines)


def _cleanup(text: str) -> str:
    lines = [re.sub(r"[^\S\n]+", " ", line).strip() for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
