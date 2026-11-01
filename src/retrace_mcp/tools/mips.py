"""Herramientas de análisis de ensamblador MIPS (R4300i / R5900)."""

from __future__ import annotations

from ..adapters import capstone_asm
from ..errors import ValidationError
from ..registry import tool
from ..security import read_bytes


@tool
def mips_disassemble(
    path: str,
    address: int = 0,
    offset: int = 0,
    size: int = 0,
    arch: str = "mips32_be",
    count: int = 0,
) -> dict:
    """Desensambla una región de un binario (ROM, ELF o dump) como MIPS.

    Args:
        path: Archivo binario a leer.
        address: Dirección virtual donde se mapea el primer byte (para etiquetas).
        offset: Desplazamiento en bytes dentro del archivo.
        size: Número de bytes a desensamblar (0 = hasta el final).
        arch: ``mips32_be`` (N64 R4300i), ``mips32_le`` (PS2 R5900),
              ``mips64_be`` o ``mips64_le``.
        count: Máximo de instrucciones (0 = todas).

    Nota: las instrucciones multimedia propias del R5900 (MMI) pueden
    decodificarse como MIPS genérico por limitación de Capstone.
    """
    data = read_bytes(path)
    if offset < 0 or offset >= len(data):
        raise ValidationError(f"offset fuera de rango (0..{len(data) - 1})")
    chunk = data[offset:] if size <= 0 else data[offset : offset + size]
    if not chunk:
        raise ValidationError("Región vacía para desensamblar")
    insns = capstone_asm.disassemble(chunk, address, arch, count)
    return {
        "arch": arch,
        "address": hex(address),
        "offset": offset,
        "size_bytes": len(chunk),
        "count": len(insns),
        "instructions": insns,
    }
