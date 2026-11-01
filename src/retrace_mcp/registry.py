"""Registro de herramientas MCP.

Concentra la instancia :class:`FastMCP` y el decorador ``@tool`` que añade un
sobre de error estructurado a todas las herramientas. Cada herramienta devuelve
un dict de datos plano; el decorador lo envuelve en ``{"ok": true, "data": ...}``
y convierte las excepciones en ``{"ok": false, "error": {"code", "message"}}``.
"""

from __future__ import annotations

import functools
from typing import Callable

from mcp.server.fastmcp import FastMCP

from .errors import RetraceError

mcp = FastMCP(
    "retrace",
    instructions=(
        "Motor de ingeniería inversa para Nintendo 64 y PlayStation 2. "
        "Analiza ROMs (N64), ejecutables ELF (PS2), ensamblador MIPS "
        "(R4300i / R5900), memoria, gráficos y audio. Trabaja siempre sobre "
        "copias y no ejecuta código extraído de binarios."
    ),
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

    return mcp.tool()(safe)
