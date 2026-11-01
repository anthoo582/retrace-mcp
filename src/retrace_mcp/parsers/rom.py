"""Parser de ROMs de Nintendo 64.

Reconoce los tres órdenes de bytes habituales (z64 / v64 / n64), normaliza a
big-endian y lee la cabecera de 64 bytes. No modifica el archivo original: las
operaciones trabajan sobre bytes en memoria.
"""

from __future__ import annotations

import struct
import zlib

from ..errors import ParseError

HEADER_SIZE = 0x40
BOOT_SIZE = 0xFC0  # 0x1000 - 0x40

# Códigos de región de la cabecera N64 (byte 0x3E).
_COUNTRY = {
    0x41: "World",
    0x44: "Germany",
    0x45: "USA",
    0x46: "France",
    0x49: "Italy",
    0x4A: "Japan",
    0x50: "Europe",
    0x53: "Spain",
    0x55: "Australia",
    0x58: "Europe",
    0x59: "Europe",
}


def detect_byte_order(data: bytes) -> str:
    """Identifica el orden de bytes por la constante de arranque 0x80371240."""
    if len(data) < 4:
        raise ParseError("Archivo demasiado pequeño para ser una ROM N64")
    head = data[:4]
    if head == b"\x80\x37\x12\x40":
        return "z64"  # big-endian nativo
    if head == b"\x37\x80\x40\x12":
        return "v64"  # byteswap de 16 bits
    if head == b"\x40\x12\x37\x80":
        return "n64"  # wordswap de 32 bits
    raise ParseError(
        "Cabecera N64 no reconocida (constante 0x80371240 no hallada en ningún orden)."
    )


def to_z64(data: bytes, order: str) -> bytes:
    """Normaliza a big-endian (z64)."""
    if order == "z64":
        return data
    if order == "v64":
        return b"".join(data[i : i + 2][::-1] for i in range(0, len(data), 2))
    if order == "n64":
        return b"".join(data[i : i + 4][::-1] for i in range(0, len(data), 4))
    raise ParseError(f"Orden de bytes desconocido: {order}")


def parse_header(z64: bytes) -> dict:
    if len(z64) < HEADER_SIZE:
        raise ParseError("ROM demasiado corta para contener la cabecera de 64 bytes")

    clock = struct.unpack(">I", z64[0x00:0x04])[0]
    entry = struct.unpack(">I", z64[0x04:0x08])[0]
    release = struct.unpack(">I", z64[0x08:0x0C])[0]
    crc1 = struct.unpack(">I", z64[0x0C:0x10])[0]
    crc2 = struct.unpack(">I", z64[0x10:0x14])[0]
    name = z64[0x20:0x34].split(b"\x00", 1)[0].decode("ascii", "replace")
    cart_id = z64[0x3C:0x3E].decode("ascii", "replace")
    country_byte = z64[0x3E]
    version = z64[0x3F]

    return {
        "clock_rate": hex(clock),
        "entry_point": hex(entry),
        "release": hex(release),
        "crc1": hex(crc1),
        "crc2": hex(crc2),
        "name": name.strip() or None,
        "cartridge_id": cart_id,
        "country_code": chr(country_byte) if 0x20 <= country_byte < 0x7F else f"0x{country_byte:02X}",
        "country": _COUNTRY.get(country_byte, "Unknown"),
        "version": f"1.{version}",
    }


def crc32_informative(data: bytes) -> str:
    """CRC32 (zlib) de referencia. NO es el CRC de validación del header N64."""
    return format(zlib.crc32(data) & 0xFFFFFFFF, "08X")


def summarize(data: bytes) -> dict:
    order = detect_byte_order(data)
    z64 = to_z64(data, order)
    header = parse_header(z64)
    return {
        "size_bytes": len(data),
        "byte_order": order,
        "header": header,
        "crc32_zlib": crc32_informative(z64),
        "regions": {
            "header": {"offset": 0, "size": HEADER_SIZE},
            "boot_code": {"offset": HEADER_SIZE, "size": BOOT_SIZE},
            "body": {"offset": HEADER_SIZE + BOOT_SIZE, "size": max(0, len(z64) - HEADER_SIZE - BOOT_SIZE)},
        },
    }
