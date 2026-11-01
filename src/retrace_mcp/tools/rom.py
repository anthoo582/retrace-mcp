"""Herramientas de análisis de ROMs de Nintendo 64."""

from __future__ import annotations

from ..parsers import rom as rom_parser
from ..registry import tool
from ..security import read_bytes


@tool
def rom_identify_format(path: str) -> dict:
    """Identifica el orden de bytes de una ROM de Nintendo 64 (z64 / v64 / n64)."""
    data = read_bytes(path)
    order = rom_parser.detect_byte_order(data)
    return {"path": path, "byte_order": order, "size_bytes": len(data)}


@tool
def rom_inspect(path: str) -> dict:
    """Resumen completo de una ROM N64: orden, cabecera, regiones y CRC de referencia."""
    return rom_parser.summarize(read_bytes(path))


@tool
def rom_extract_metadata(path: str) -> dict:
    """Extrae la cabecera N64: nombre, id de cartucho, región, versión, entry point y CRC."""
    data = read_bytes(path)
    z64 = rom_parser.to_z64(data, rom_parser.detect_byte_order(data))
    return rom_parser.parse_header(z64)


@tool
def rom_list_segments(path: str) -> dict:
    """Regiones lógicas de la ROM (header / boot / body) y entry point.

    El mapeo de segmentos de una descompilación (0x02, 0x05, ...) requiere un
    linker script o mapa de símbolos; aquí se reporta el layout físico.
    """
    data = read_bytes(path)
    z64 = rom_parser.to_z64(data, rom_parser.detect_byte_order(data))
    header = rom_parser.parse_header(z64)
    return {
        "entry_point": header["entry_point"],
        "regions": {
            "header": {"offset": 0, "size": 0x40},
            "boot_code": {"offset": 0x40, "size": 0xFC0},
            "body": {"offset": 0x1000, "size": max(0, len(z64) - 0x1000)},
        },
    }
