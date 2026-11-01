"""Errores tipados del servidor.

Toda condición de error esperada debe lanzar una subclase de
:class:`RetraceError` con un ``code`` estable. El SDK MCP convierte estas
excepciones en respuestas de error estructuradas para el cliente.
"""

from __future__ import annotations


class RetraceError(Exception):
    """Error base de la herramienta. ``code`` es un identificador estable."""

    code = "RETRACE_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message}


class NotFoundError(RetraceError):
    code = "NOT_FOUND"


class ParseError(RetraceError):
    code = "PARSE_ERROR"


class UnsupportedError(RetraceError):
    code = "UNSUPPORTED"


class SecurityError(RetraceError):
    code = "SECURITY_ERROR"


class ValidationError(RetraceError):
    code = "VALIDATION_ERROR"


class ToolUnavailableError(RetraceError):
    code = "TOOL_UNAVAILABLE"


class TimeoutError(RetraceError):
    code = "TIMEOUT"
