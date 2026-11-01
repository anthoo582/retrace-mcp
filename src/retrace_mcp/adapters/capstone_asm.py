"""Desensamblador MIPS vía Capstone.

Cubre las dos arquitecturas objetivo con la salvedad documentada de que las
instrucciones multimedia propias del R5900 (MMI) pueden decodificarse como
MIPS genérico: Capstone no modela por completo el conjunto MMI del EE.
"""

from __future__ import annotations

from capstone import (
    CS_ARCH_MIPS,
    CS_MODE_BIG_ENDIAN,
    CS_MODE_LITTLE_ENDIAN,
    CS_MODE_MIPS32,
    CS_MODE_MIPS64,
    Cs,
)

from ..errors import UnsupportedError

ARCHS: dict[str, tuple[int, str]] = {
    "mips32_be": (CS_MODE_MIPS32 | CS_MODE_BIG_ENDIAN, "MIPS32 big-endian (N64 R4300i)"),
    "mips32_le": (CS_MODE_MIPS32 | CS_MODE_LITTLE_ENDIAN, "MIPS32 little-endian (PS2 R5900)"),
    "mips64_be": (CS_MODE_MIPS64 | CS_MODE_BIG_ENDIAN, "MIPS64 big-endian"),
    "mips64_le": (CS_MODE_MIPS64 | CS_MODE_LITTLE_ENDIAN, "MIPS64 little-endian"),
}


def disassemble(data: bytes, address: int, arch: str, count: int = 0) -> list[dict]:
    """Desensambla ``data`` a partir de ``address``.

    ``count == 0`` desensambla hasta agotar el buffer.
    """
    if arch not in ARCHS:
        raise UnsupportedError(
            f"Arquitectura '{arch}' no soportada. Opciones: {sorted(ARCHS)}"
        )
    mode, _desc = ARCHS[arch]
    md = Cs(CS_ARCH_MIPS, mode)
    md.detail = True
    md.skipdata = True
    out: list[dict] = []
    for insn in md.disasm(data, address, count=count):
        out.append(
            {
                "address": insn.address,
                "size": insn.size,
                "mnemonic": insn.mnemonic,
                "op_str": insn.op_str,
                "bytes": insn.bytes.hex(),
            }
        )
    return out
