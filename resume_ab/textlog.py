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
log.propagate = False


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
    """Append résumé text to ``data_dir/logs/resume-text.log`` only.

    The file is mode 600. Records do not propagate to the process output, so a
    shared log stream cannot hand the unredacted text to a client.
    """
    path = data_dir / "logs" / "resume-text.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch(exist_ok=True)
    path.chmod(0o600)
    log.propagate = False
    log.handlers = [handler for handler in log.handlers if type(handler) is not logging.StreamHandler]
    resolved = str(path.resolve())
    if not any(getattr(handler, "baseFilename", None) == resolved for handler in log.handlers):
        file_handler = logging.FileHandler(path, encoding="utf-8")
        file_handler.setFormatter(logging.Formatter("%(message)s\n"))
        log.addHandler(file_handler)
    return path
