"""Stable error taxonomy shared by every sidecar method."""

from __future__ import annotations

from typing import Any


class RetraceError(Exception):
    """A failure that maps to a documented sidecar error code."""

    code = "INTERNAL"

    def __init__(self, message: str, *, code: str | None = None, details: Any = None) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code
        self.message = message
        self.details = details

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            payload["details"] = self.details
        return payload


def invalid_params(message: str, **details: Any) -> RetraceError:
    return RetraceError(message, code="INVALID_PARAMS", details=details or None)


def not_found(message: str, **details: Any) -> RetraceError:
    return RetraceError(message, code="NOT_FOUND", details=details or None)


def unsupported(message: str, **details: Any) -> RetraceError:
    return RetraceError(message, code="UNSUPPORTED", details=details or None)


def too_large(message: str, **details: Any) -> RetraceError:
    return RetraceError(message, code="TOO_LARGE", details=details or None)


def denied_path(message: str, **details: Any) -> RetraceError:
    return RetraceError(message, code="DENIED_PATH", details=details or None)


def dependency_missing(message: str, **details: Any) -> RetraceError:
    return RetraceError(message, code="DEPENDENCY_MISSING", details=details or None)


def parse_error(message: str, **details: Any) -> RetraceError:
    return RetraceError(message, code="PARSE_ERROR", details=details or None)
