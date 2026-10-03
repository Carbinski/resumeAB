"""Internal log of résumé text after extraction and after redaction.

This stays on the API process and in ``data/logs/resume-text.log``. It is not
returned to the browser.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("resume_ab.text")
log.setLevel(logging.INFO)


def log_resume_text(*, stage: str, filename: str, text: str, resume_id: str | None = None) -> None:
    """Record the full text for one stage: ``extracted`` or ``redacted``."""
    identity = f" id={resume_id}" if resume_id else ""
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    log.info(
        "----- %s %s%s file=%s chars=%d -----\n%s\n----- end %s -----",
        stamp,
        stage,
        identity,
        filename,
        len(text),
        text,
        stage,
    )


def configure_text_log(data_dir: Path) -> Path:
    """Append the same text log to ``data_dir/logs/resume-text.log`` and stderr."""
    path = data_dir / "logs" / "resume-text.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    resolved = str(path.resolve())
    if not any(getattr(handler, "baseFilename", None) == resolved for handler in log.handlers):
        file_handler = logging.FileHandler(path, encoding="utf-8")
        file_handler.setFormatter(logging.Formatter("%(message)s\n"))
        log.addHandler(file_handler)
    if not any(type(handler) is logging.StreamHandler for handler in log.handlers):
        stream = logging.StreamHandler()
        stream.setFormatter(logging.Formatter("%(message)s"))
        log.addHandler(stream)
    return path
