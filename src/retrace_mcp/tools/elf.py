"""Herramientas de análisis de ejecutables ELF (PS2 / MIPS)."""

from __future__ import annotations

from ..parsers import elf as elf_parser
from ..registry import tool
from ..security import check_size, require_readable


@tool
def elf_inspect(path: str) -> dict:
    """Cabecera ELF: clase, endianness, máquina (MIPS/R5900), entry, secciones y segmentos."""
    require_readable(path)
    check_size(path)
    return elf_parser.inspect(path)


@tool
def elf_list_sections(path: str) -> dict:
    """Lista las secciones del ELF (nombre, tipo, dirección, tamaño, flags)."""
    require_readable(path)
    check_size(path)
    return {"sections": elf_parser.list_sections(path)}


@tool
def elf_list_segments(path: str) -> dict:
    """Lista los segmentos (program headers) del ELF."""
    require_readable(path)
    check_size(path)
    return {"segments": elf_parser.list_segments(path)}


@tool
def elf_list_symbols(path: str, include_dynamic: bool = True, limit: int = 2000) -> dict:
    """Lista los símbolos de las tablas .symtab y .dynsym del ELF.

    Args:
        include_dynamic: Incluir también la tabla dinámica (.dynsym).
        limit: Máximo de símbolos devueltos (0 = sin límite).
    """
    require_readable(path)
    check_size(path)
    return elf_parser.list_symbols(path, include_dynamic, limit)


@tool
def elf_find_function(path: str, name: str, exact: bool = False, limit: int = 200) -> dict:
    """Busca funciones/símbolos por nombre en las tablas de símbolos del ELF.

    Args:
        name: Nombre o subcadena a buscar.
        exact: Coincidencia exacta del nombre.
        limit: Máximo de resultados.
    """
    require_readable(path)
    check_size(path)
    results = elf_parser.find_symbols(path, name, exact, limit)
    return {"query": name, "exact": exact, "total": len(results), "symbols": results}
