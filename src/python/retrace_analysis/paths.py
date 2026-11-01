"""Path and size guards for every file the sidecar opens.

The sidecar treats analysed files as untrusted data: it never executes them, it
opens them read-only, and it refuses anything that is not an absolute path to a
regular file inside the configured limits.
"""

from __future__ import annotations

import os
from pathlib import Path

from .errors import denied_path, not_found, too_large

DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024


def max_file_bytes() -> int:
    raw = os.environ.get("RETRACE_MAX_FILE_BYTES")
    if not raw:
        return DEFAULT_MAX_FILE_BYTES
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_FILE_BYTES
    return value if value > 0 else DEFAULT_MAX_FILE_BYTES


def checked_path(raw: object, *, field: str = "path") -> Path:
    if not isinstance(raw, str) or not raw.strip():
        raise denied_path(f"{field} must be a non-empty absolute path", field=field)
    candidate = Path(raw)
    if not candidate.is_absolute():
        raise denied_path(f"{field} must be absolute", field=field, value=raw)
    try:
        resolved = candidate.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise not_found(f"{field} does not exist", field=field, value=raw, reason=str(exc)) from exc
    if not resolved.is_file():
        raise denied_path(f"{field} is not a regular file", field=field, value=str(resolved))
    size = resolved.stat().st_size
    limit = max_file_bytes()
    if size > limit:
        raise too_large(
            f"{field} is {size} bytes, over the {limit} byte limit",
            field=field,
            size=size,
            limit=limit,
        )
    return resolved


def read_bytes(raw: object, *, field: str = "path") -> tuple[Path, bytes]:
    path = checked_path(raw, field=field)
    with path.open("rb") as handle:
        return path, handle.read()


def looks_like_hex(value: object) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip().lower().replace("0x", "").replace("_", "").replace(" ", "")
    if not text or len(text) % 2 != 0:
        return False
    return all(ch in "0123456789abcdef" for ch in text)
