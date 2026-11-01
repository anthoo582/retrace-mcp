"""Adaptador para binutils (readelf / objdump / nm / strings).

Busca primero el toolchain MIPS de PS2, luego variantes MIPS de Linux y por
último las herramientas del host. Devuelve la salida cruda de cada comando; la
interpretación se hace en los módulos de herramientas.
"""

from __future__ import annotations

import shutil
import subprocess
from typing import Sequence

from ..errors import TimeoutError, ToolUnavailableError
from .base import ToolResult

_CANDIDATES: dict[str, tuple[str, ...]] = {
    "readelf": (
        "mips64r5900el-ps2-elf-readelf",
        "mips-linux-gnu-readelf",
        "mips64-linux-gnuabi64-readelf",
        "llvm-readelf",
        "readelf",
    ),
    "objdump": (
        "mips64r5900el-ps2-elf-objdump",
        "mips-linux-gnu-objdump",
        "mips64-linux-gnuabi64-objdump",
        "llvm-objdump",
        "objdump",
    ),
    "nm": (
        "mips64r5900el-ps2-elf-nm",
        "mips-linux-gnu-nm",
        "mips64-linux-gnuabi64-nm",
        "llvm-nm",
        "nm",
    ),
    "strings": ("strings",),
}


def find_bin(tool: str) -> str | None:
    for candidate in _CANDIDATES.get(tool, ()):
        found = shutil.which(candidate)
        if found:
            return found
    return None


class BinutilsAdapter:
    """Ejecuta readelf/objdump/nm/strings usando el binario MIPS correcto."""

    name = "binutils"

    def __init__(self, timeout: int = 30) -> None:
        self.timeout = timeout

    def _exe(self, tool: str) -> str:
        exe = find_bin(tool)
        if exe is None:
            raise ToolUnavailableError(
                f"binutils '{tool}' no disponible. Candidatos: {', '.join(_CANDIDATES[tool])}"
            )
        return exe

    def run(self, tool: str, args: Sequence[str]) -> ToolResult:
        exe = self._exe(tool)
        try:
            proc = subprocess.run(
                [exe, *args],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=self.timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError(f"{exe} agotó el tiempo ({self.timeout}s)") from exc
        return ToolResult(proc.returncode, proc.stdout, proc.stderr)

    def readelf(self, path: str, *flags: str) -> ToolResult:
        return self.run("readelf", [*flags, path])

    def objdump(self, path: str, *flags: str) -> ToolResult:
        return self.run("objdump", [*flags, path])

    def nm(self, path: str, *flags: str) -> ToolResult:
        return self.run("nm", [*flags, path])

    def strings(self, path: str, *flags: str) -> ToolResult:
        return self.run("strings", [*flags, path])
