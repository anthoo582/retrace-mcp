"""Parser de dumps de memoria y análisis de crashes.

Soporte para:
- Dumps binarios de memoria
- Registros de CPU (MIPS R4300i / R5900)
- Stack traces
- Análisis de punteros
- Correlación con símbolos
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..errors import ParseError, ValidationError


class MemoryDump:
    """Representación de un dump de memoria."""

    def __init__(self, data: bytes, base_address: int = 0) -> None:
        self.data = data
        self.base_address = base_address
        self.size = len(data)

    def read_u32_be(self, offset: int) -> int:
        """Lee un uint32 big-endian."""
        if offset < 0 or offset + 4 > self.size:
            raise ValidationError(f"Offset fuera de rango: {offset}")
        return int.from_bytes(self.data[offset : offset + 4], "big")

    def read_u32_le(self, offset: int) -> int:
        """Lee un uint32 little-endian."""
        if offset < 0 or offset + 4 > self.size:
            raise ValidationError(f"Offset fuera de rango: {offset}")
        return int.from_bytes(self.data[offset : offset + 4], "little")

    def read_bytes(self, offset: int, count: int) -> bytes:
        """Lee un rango de bytes."""
        if offset < 0 or offset + count > self.size:
            raise ValidationError(f"Rango fuera de límites: {offset}+{count}")
        return self.data[offset : offset + count]

    def find_pattern(self, pattern: bytes, start: int = 0, max_results: int = 100) -> list[int]:
        """Busca un patrón de bytes en el dump."""
        results: list[int] = []
        pos = start
        while pos < self.size and len(results) < max_results:
            found = self.data.find(pattern, pos)
            if found == -1:
                break
            results.append(found)
            pos = found + 1
        return results


class CPURegisters:
    """Registros de CPU MIPS."""

    def __init__(self, arch: str = "mips32") -> None:
        self.arch = arch
        self.gpr: dict[str, int] = {}  # General Purpose Registers
        self.pc: int | None = None
        self.hi: int | None = None
        self.lo: int | None = None

    def set_gpr(self, name: str, value: int) -> None:
        """Establece un registro general."""
        self.gpr[name] = value

    def get_gpr(self, name: str) -> int | None:
        """Obtiene un registro general."""
        return self.gpr.get(name)

    def to_dict(self) -> dict[str, Any]:
        """Convierte a diccionario."""
        return {
            "arch": self.arch,
            "pc": hex(self.pc) if self.pc is not None else None,
            "hi": hex(self.hi) if self.hi is not None else None,
            "lo": hex(self.lo) if self.lo is not None else None,
            "gpr": {k: hex(v) for k, v in self.gpr.items()},
        }


class CrashContext:
    """Contexto de un crash con registros, stack y metadata."""

    def __init__(self) -> None:
        self.registers: CPURegisters | None = None
        self.stack_dump: bytes | None = None
        self.stack_base: int | None = None
        self.fault_address: int | None = None
        self.fault_type: str | None = None
        self.backtrace: list[int] = []
        self.metadata: dict[str, Any] = {}

    def to_dict(self) -> dict[str, Any]:
        """Convierte a diccionario."""
        return {
            "registers": self.registers.to_dict() if self.registers else None,
            "stack_base": hex(self.stack_base) if self.stack_base else None,
            "stack_size": len(self.stack_dump) if self.stack_dump else 0,
            "fault_address": hex(self.fault_address) if self.fault_address else None,
            "fault_type": self.fault_type,
            "backtrace": [hex(addr) for addr in self.backtrace],
            "metadata": self.metadata,
        }


def parse_pcsx2_crash(log_text: str) -> CrashContext:
    """Parsea un crash log de PCSX2.

    Formato esperado (ejemplo):
        PC: 0x00100000
        RA: 0x00100020
        SP: 0x01fff800
        ...
    """
    ctx = CrashContext()
    ctx.registers = CPURegisters("r5900")

    lines = log_text.splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()

            try:
                if key == "pc":
                    ctx.registers.pc = int(value, 16)
                elif key in ("ra", "sp", "gp", "fp", "at", "v0", "v1", "a0", "a1", "a2", "a3"):
                    ctx.registers.set_gpr(key, int(value, 16))
                elif key == "fault_address":
                    ctx.fault_address = int(value, 16)
                elif key == "fault_type":
                    ctx.fault_type = value
            except ValueError:
                # Ignorar líneas con formato inválido
                pass

    return ctx


def analyze_pointer(address: int, arch: str = "mips32") -> dict[str, Any]:
    """Analiza un puntero y detecta problemas comunes.

    Detecta:
    - Punteros nulos
    - Punteros desalineados
    - Punteros fuera de rangos conocidos
    """
    issues: list[str] = []

    if address == 0:
        issues.append("null_pointer")

    # MIPS requiere alineación de 4 bytes para accesos de 32 bits
    if address % 4 != 0:
        issues.append("misaligned")

    # Rangos típicos de memoria
    # N64: 0x80000000-0x807FFFFF (RAM cached), 0xA0000000-0xA07FFFFF (RAM uncached)
    # PS2: 0x00000000-0x01FFFFFF (RAM), 0x80000000-0x81FFFFFF (cached)

    if arch == "mips32" and address >= 0x80000000:
        # Direcciones virtuales en MIPS
        if address < 0x80000000 or address > 0xBFFFFFFF:
            issues.append("invalid_virtual_range")
    elif address > 0x1FFFFFFF:
        issues.append("suspiciously_high")

    return {
        "address": hex(address),
        "arch": arch,
        "issues": issues,
        "is_valid": len(issues) == 0,
    }


def extract_stack_trace(
    stack_data: bytes, stack_base: int, arch: str = "mips32", max_depth: int = 32
) -> list[int]:
    """Extrae direcciones de retorno del stack.

    Busca valores que parecen direcciones de código (rangos típicos de MIPS).
    """
    addresses: list[int] = []
    endian = "little" if arch in ("r5900", "mips32_le") else "big"

    for i in range(0, min(len(stack_data), max_depth * 4), 4):
        try:
            value = int.from_bytes(stack_data[i : i + 4], endian)
            # Heurística: direcciones de código suelen estar en rangos altos
            if 0x80000000 <= value <= 0x8FFFFFFF or 0x00080000 <= value <= 0x01FFFFFF:
                addresses.append(value)
        except Exception:  # noqa: BLE001
            pass

    return addresses[:max_depth]
