"""Ensamblado y arranque del servidor MCP."""

from __future__ import annotations

import argparse

from .config import load_settings
from .logging_util import get_logger, setup_logging
from .registry import mcp


def register_tools() -> None:
    """Importa los módulos de herramientas para que se registren en ``mcp``."""
    from .tools import elf, memory, mips, repo, rom  # noqa: F401

    _ = (repo, rom, elf, mips, memory)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="retrace-mcp",
        description="N64 / PS2 Reverse Engineering MCP server",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "streamable-http", "sse"],
        default=None,
        help="Transporte MCP (por defecto se toma de RETRACE_TRANSPORT o 'stdio')",
    )
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args(argv)

    settings = load_settings()
    setup_logging(settings.log_level)
    register_tools()

    transport = args.transport or settings.transport
    log = get_logger("server")
    log.info("starting", extra={"data": {"transport": transport, "version": "1.0.0"}})

    # MCP v2 usa run() con opciones específicas
    if transport in ("streamable-http", "sse"):
        # El transporte HTTP es opcional (requiere el extra 'http').
        # stdio es el transporte primario para los tres clientes soportados.
        import anyio
        from mcp.server.stdio import stdio_server

        log.warning("HTTP transport not yet migrated to MCP v2, falling back to stdio")
        anyio.run(stdio_server, mcp)
    else:
        import anyio
        from mcp.server.stdio import stdio_server

        anyio.run(stdio_server, mcp)
    return 0
