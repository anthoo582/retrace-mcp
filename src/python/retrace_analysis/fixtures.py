"""Synthetic N64 ROM fixture builder (no game data, no copyrighted content).

Builds a minimal, valid-header ROM in the three common byte orders so tests can
exercise format detection without any real game image.
"""

from __future__ import annotations

import struct

COUNTRY_USA = 0x45


def _be_header(name: str, entry: int, crc1: int, crc2: int, country: int) -> bytes:
    header = bytearray(0x40)
    struct.pack_into(">I", header, 0x00, 0x80371240)  # PI BSD Domain 1
    struct.pack_into(">I", header, 0x04, 0x0000000F)  # clock rate
    struct.pack_into(">I", header, 0x08, entry)       # entry point
    struct.pack_into(">I", header, 0x0C, 0x0000144C)  # libultra version
    struct.pack_into(">I", header, 0x10, crc1)
    struct.pack_into(">I", header, 0x14, crc2)
    raw = name.encode("ascii")[:20]
    header[0x20:0x20 + len(raw)] = raw
    header[0x38:0x3C] = b"NSYN"                       # synthetic manufacturer
    struct.pack_into(">H", header, 0x3C, 0x0001)      # cart id
    header[0x3E] = country
    header[0x3F] = 0x00                               # version
    return bytes(header)


def synthetic_rom(
    *,
    byte_order: str = "z64",
    name: str = "RETRACE SYNTHETIC",
    entry: int = 0x80000400,
    crc1: int = 0x12345678,
    crc2: int = 0x9ABCDEF0,
    country: int = COUNTRY_USA,
    size: int = 0x1000,
) -> bytes:
    """Return a minimal ROM in ``z64`` (big-endian), ``v64`` (16-bit swapped) or
    ``n64`` (32-bit little-endian) order."""

    if size < 0x40:
        raise ValueError("size must be at least 0x40")
    body = bytearray(size)
    body[:0x40] = _be_header(name, entry, crc1, crc2, country)
    # A handful of plausible MIPS words after the header, big-endian.
    code = struct.pack(">IIII", 0x27BDFFE0, 0xAFBF001C, 0x0C000000, 0x00000000)
    body[0x1000 - 0x40:0x1000] = body[0x1000 - 0x40:0x1000]  # no-op, keeps layout explicit
    start = 0x40
    body[start:start + len(code)] = code

    if byte_order == "z64":
        return bytes(body)
    if byte_order == "v64":
        swapped = bytearray(body)
        swapped[0::2], swapped[1::2] = body[1::2], body[0::2]
        return bytes(swapped)
    if byte_order == "n64":
        out = bytearray(body)
        for i in range(0, len(body), 4):
            out[i:i + 4] = body[i:i + 4][::-1]
        return bytes(out)
    raise ValueError(f"unknown byte order: {byte_order}")
