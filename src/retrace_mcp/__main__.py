"""Punto de entrada: ``python -m retrace_mcp`` o el script ``retrace-mcp``."""

from __future__ import annotations

import sys

from .server import main

if __name__ == "__main__":
    sys.exit(main())
