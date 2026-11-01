"""Registro de herramientas MCP.

Concentra la instancia :class:`MCPServer` y el decorador ``@tool`` que añade un
sobre de error estructurado a todas las herramientas. Cada herramienta devuelve
un dict de datos plano; el decorador lo envuelve en ``{"ok": true, "data": ...}``
y convierte las excepciones en ``{"ok": false, "error": {"code", "message"}}``.
"""

from __future__ import annotations

import functools
from typing import Callable

from mcp.server.mcpserver import MCPServer

from .errors import RetraceError

mcp = MCPServer(
    "retrace"
)


def tool(func: Callable) -> Callable:
    """Registra ``func`` como herramienta MCP con manejo de errores tipado."""

    @functools.wraps(func)
    def safe(*args, **kwargs):  # noqa: ANN002, ANN003
        try:
            result = func(*args, **kwargs)
        except RetraceError as exc:
            return {"ok": False, "error": exc.to_dict()}
        except Exception as exc:  # noqa: BLE001 - última barrera de contención
            return {"ok": False, "error": {"code": "INTERNAL", "message": str(exc)}}
        if isinstance(result, dict) and "ok" in result:
            return result
        return {"ok": True, "data": result}

    # Decorador de MCP v2
    return mcp.tool(name=func.__name__)(safe)
