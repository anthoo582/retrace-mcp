"""Nintendo 64 ROM format identification and header parsing.

N64 images exist in three byte orders and the emulator/toolchain in use decides
which one is expected. Detection is exact on the four magic bytes; header fields
are then read from a big-endian canonical copy. Nothing here writes to, patches
or executes a ROM.
"""

from __future__ import annotations

import struct
from typing import Any

from .errors import invalid_params, parse_error
from .paths import checked_path

MAGICS = {
    b"\x80\x37\x12\x40": ("z64", "big", "Big-endian, the canonical/most common order."),
    b"\x37\x80\x40\x12": ("v64", "byteswapped", "Byteswapped: 16-bit pairs swapped (Doctor V64 style)."),
    b"\x40\x12\x37\x80": ("n64", "little", "Little-endian: 32-bit words byte-reversed."),
    b"\x12\x40\x80\x37": ("v64-le", "byteswapped", "Rare 16-bit swap variant of the little-endian order."),
}

COUNTRY_CODES = {
    0x44: "Germany (PAL)",
    0x45: "North America (NTSC)",
    0x46: "France (PAL)",
    0x48: "Netherlands (PAL)",
    0x49: "Italy (PAL)",
    0x4A: "Japan (NTSC)",
    0x50: "Europe (PAL)",
    0x53: "Spain (PAL)",
    0x55: "Australia (PAL)",
    0x58: "Europe (PAL)",
    0x59: "Europe (PAL)",
}

HEADER_SIZE = 0x40


def _to_big_endian(data: bytes, byte_order: str) -> bytes:
    if byte_order == "z64":
        return data
    if byte_order in {"v64", "v64-le"}:
        out = bytearray(data)
        out[0::2], out[1::2] = data[1::2], data[0::2]
        return bytes(out)
    if byte_order == "n64":
        out = bytearray(data)
        for index in range(0, len(data) - len(data) % 4, 4):
            out[index:index + 4] = data[index:index + 4][::-1]
        return bytes(out)
    raise invalid_params("unknown byte order", byte_order=byte_order)


def identify_bytes(data: bytes) -> dict[str, Any]:
    if len(data) < 4:
        raise parse_error("file is shorter than 4 bytes", size=len(data))
    magic = data[:4]
    known = MAGICS.get(magic)
    result: dict[str, Any] = {
        "magic": magic.hex(),
        "size": len(data),
        "recognised": known is not None,
        "confidence": "confirmed" if known else "insufficient",
        "evidence": {"source": "file bytes", "tool": "builtin"},
        "limitations": [
            "A magic match proves byte order, not that the image is complete or undamaged.",
        ],
    }
    if known:
        byte_order, endianness, note = known
        result.update({
            "format": "n64-rom",
            "byte_order": byte_order,
            "endianness": endianness,
            "notes": note,
            "normalisation": {
                "to": "z64",
                "operation": {
                    "z64": "none",
                    "v64": "swap every 16-bit pair",
                    "v64-le": "swap every 16-bit pair",
                    "n64": "reverse every 32-bit word",
                }[byte_order],
                "suggested_output": "*.normalised.z64 (never overwrite the original)",
            },
        })
    else:
        result["limitations"].append(
            "First four bytes match no documented N64 magic; this may not be an N64 image."
        )
    return result


def _parse_header(big_endian: bytes) -> dict[str, Any]:
    if len(big_endian) < HEADER_SIZE:
        raise parse_error("file is shorter than the 0x40 byte N64 header", size=len(big_endian))
    (pi_domain, clock_rate, entry, libultra, crc1, crc2) = struct.unpack_from(">IIIIII", big_endian, 0)
    name = big_endian[0x20:0x34].split(b"\x00", 1)[0].decode("ascii", "replace").strip()
    manufacturer = big_endian[0x38:0x3C].decode("ascii", "replace").rstrip("\x00").strip()
    cart_id = big_endian[0x3C:0x3E].hex()
    country = big_endian[0x3E]
    version = big_endian[0x3F]
    return {
        "pi_bsd_domain_1": pi_domain,
        "clock_rate": clock_rate,
        "entry_point": entry,
        "libultra_version": hex(libultra),
        "crc1": crc1,
        "crc2": crc2,
        "image_name": name,
        "manufacturer_id": manufacturer,
        "cartridge_id": cart_id,
        "country_code": {"value": country, "hex": hex(country), "name": COUNTRY_CODES.get(country)},
        "version": version,
    }


def identify(params: dict[str, Any]) -> dict[str, Any]:
    path = checked_path(params.get("path"), field="path")
    with path.open("rb") as handle:
        head = handle.read(HEADER_SIZE)
    result = identify_bytes(head)
    result["path"] = str(path)
    result["file_size"] = path.stat().st_size
    if result.get("byte_order"):
        canonical = _to_big_endian(head, result["byte_order"])
        result["header"] = _parse_header(canonical)
    return result


def inspect(params: dict[str, Any]) -> dict[str, Any]:
    path = checked_path(params.get("path"), field="path")
    size = path.stat().st_size
    with path.open("rb") as handle:
        head = handle.read(HEADER_SIZE)
    result = identify_bytes(head)
    result["path"] = str(path)
    result["file_size"] = size
    result["size_mib"] = round(size / (1024 * 1024), 3)
    result["size_multiple_of_1_mib"] = size % (1024 * 1024) == 0
    if result.get("byte_order"):
        result["header"] = _parse_header(_to_big_endian(head, result["byte_order"]))
    result["limitations"] = result.get("limitations", []) + [
        "Header CRCs are reported, not verified: verification needs the N64 bootcode CRC algorithm and the full image.",
        "N64 has no standard container describing segments; segment layout is game-specific and requires the project's linker map or symbol config.",
        "No padding or trailing-garbage analysis is performed.",
    ]
    return result
