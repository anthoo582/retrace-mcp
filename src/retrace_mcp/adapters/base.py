"""Adaptador base para herramientas externas.

Cada adaptador comprueba disponibilidad, detecta versión y ejecuta comandos
controlados con límite de tiempo. Nunca ejecuta código extraído de un binario:
solo invoca binarios conocidos del sistema con argumentos validados.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from typing import Sequence

from ..errors import ToolUnavailableError, TimeoutError


@dataclass
class ToolResult:
    returncode: int
    stdout: str
    stderr: str


class ExternalTool:
    name = "external"
    binaries: tuple[str, ...] = ()

    def __init__(self, timeout: int = 30) -> None:
        self.timeout = timeout

    @property
    def executable(self) -> str | None:
        for name in self.binaries:
            found = shutil.which(name)
            if found:
                return found
        return None

    @property
    def available(self) -> bool:
        return self.executable is not None

    def require(self) -> str:
        exe = self.executable
        if exe is None:
            raise ToolUnavailableError(
                f"Herramienta externa '{self.name}' no disponible. "
                f"Instala uno de: {', '.join(self.binaries)}."
            )
        return exe

    def version(self) -> str | None:
        return None

    def run(self, args: Sequence[str], timeout: int | None = None) -> ToolResult:
        exe = self.require()
        limit = timeout or self.timeout
        try:
            proc = subprocess.run(
                [exe, *args],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=limit,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError(f"{self.name} agotó el tiempo ({limit}s)") from exc
        return ToolResult(proc.returncode, proc.stdout, proc.stderr)
