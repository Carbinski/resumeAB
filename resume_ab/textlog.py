"""Internal log of résumé text after extraction and after redaction.

This stays on the API process and in ``data/logs/resume-text.log``. It is not
returned to the browser. The file rotates at 8 MiB and keeps three older
files, all mode 600, so the copy of someone's résumé cannot grow without a cap.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

log = logging.getLogger("resume_ab.text")
log.setLevel(logging.INFO)
log.propagate = False

_MAX_BYTES = 8 * 1024 * 1024
_BACKUPS = 3


class _PrivateRotatingHandler(RotatingFileHandler):
    """Rotate résumé text and keep every file on that path mode 600."""

    def _open(self):
        # umask is process-wide. 077 makes the create itself mode 600, so the
        # résumé text is never briefly world-readable before the chmod.
        previous = os.umask(0o077)
        try:
            stream = super()._open()
        finally:
            os.umask(previous)
        self._restrict(self.baseFilename)
        return stream

    def doRollover(self) -> None:
        super().doRollover()
        self._restrict(self.baseFilename)
        for index in range(1, self.backupCount + 1):
            self._restrict(f"{self.baseFilename}.{index}")

    @staticmethod
    def _restrict(filename: str) -> None:
        if os.path.exists(filename):
            os.chmod(filename, 0o600)


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


def configure_text_log(
    data_dir: Path,
    *,
    max_bytes: int = _MAX_BYTES,
    backup_count: int = _BACKUPS,
) -> Path:
    """Append résumé text to ``data_dir/logs/resume-text.log`` only.

    The active file and its rotations are mode 600. Records do not propagate
    to the process output, so a shared log stream cannot hand the unredacted
    text to a client. ``max_bytes`` and ``backup_count`` bound how much of
    that text stays on disk.
    """
    if max_bytes < 1:
        max_bytes = _MAX_BYTES
    if backup_count < 1:
        backup_count = _BACKUPS
    path = data_dir / "logs" / "resume-text.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    log.propagate = False
    # One file receives this text. A second configure must not keep writing
    # the previous directory, and a stream handler must not copy it to stderr.
    kept: list[logging.Handler] = []
    for handler in list(log.handlers):
        if isinstance(handler, logging.FileHandler):
            handler.close()
            continue
        if type(handler) is logging.StreamHandler:
            continue
        kept.append(handler)
    log.handlers = kept
    file_handler = _PrivateRotatingHandler(
        path,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    file_handler.setFormatter(logging.Formatter("%(message)s\n"))
    log.addHandler(file_handler)
    path.chmod(0o600)
    return path
