"""Parser de ELF vía pyelftools.

Reconoce las particularidades de los ejecutables de PS2: ELFCLASS32,
little-endian, máquina EM_MIPS (8) con e_flags propios del EE/R5900.
"""

from __future__ import annotations

from elftools.elf.descriptions import (
    describe_e_machine,
    describe_ei_class,
    describe_ei_data,
    describe_p_type,
    describe_sh_type,
)
from elftools.elf.elffile import ELFFile
from elftools.elf.sections import SymbolTableSection

from ..errors import ParseError

EM_MIPS = 8


def _open(path: str) -> ELFFile:
    try:
        f = open(path, "rb")
        return ELFFile(f)
    except Exception as exc:  # noqa: BLE001 - pyelftools lanza varios tipos
        raise ParseError(f"No se pudo leer el ELF '{path}': {exc}") from exc


def _mips_flavor(elf: ELFFile) -> str:
    machine = elf.header["e_machine"]
    bits = elf.elfclass
    endian = "little-endian" if elf.little_endian else "big-endian"
    if machine != EM_MIPS:
        return describe_e_machine(machine)
    if bits == 64:
        return "MIPS64"
    # ELFCLASS32 little-endian = perfil típico del EE/PS2 (R5900);
    # ELFCLASS32 big-endian = perfil típico de N64 (R4300i).
    base = "MIPS32"
    if endian == "little-endian":
        base += " little-endian (perfil EE/PS2, R5900)"
    else:
        base += " big-endian (perfil N64, R4300i)"
    return base


def _symbol_dict(sym, table: str) -> dict:
    return {
        "name": sym.name,
        "value": hex(sym["st_value"]),
        "size": sym["st_size"],
        "bind": sym["st_info"]["bind"],
        "type": sym["st_info"]["type"],
        "shndx": sym["st_shndx"],
        "table": table,
    }


def inspect(path: str) -> dict:
    elf = _open(path)
    h = elf.header
    return {
        "file": path,
        "class": describe_ei_class(h["e_ident"]["EI_CLASS"]),
        "data": describe_ei_data(h["e_ident"]["EI_DATA"]),
        "type": h["e_type"],
        "machine": describe_e_machine(h["e_machine"]),
        "machine_raw": h["e_machine"],
        "mips_flavor": _mips_flavor(elf),
        "e_flags": hex(h["e_flags"]),
        "entry": hex(h["e_entry"]),
        "num_sections": elf.num_sections(),
        "num_segments": elf.num_segments(),
    }


def list_sections(path: str) -> list[dict]:
    elf = _open(path)
    out = []
    for i, section in enumerate(elf.iter_sections()):
        out.append(
            {
                "index": i,
                "name": section.name,
                "type": describe_sh_type(section["sh_type"]),
                "addr": hex(section["sh_addr"]),
                "offset": section["sh_offset"],
                "size": section["sh_size"],
                "flags": section["sh_flags"],
                "align": section["sh_addralign"],
            }
        )
    return out


def list_segments(path: str) -> list[dict]:
    elf = _open(path)
    out = []
    for i, seg in enumerate(elf.iter_segments()):
        out.append(
            {
                "index": i,
                "type": describe_p_type(seg["p_type"]),
                "vaddr": hex(seg["p_vaddr"]),
                "offset": seg["p_offset"],
                "filesz": seg["p_filesz"],
                "memsz": seg["p_memsz"],
                "flags": seg["p_flags"],
                "align": seg["p_align"],
            }
        )
    return out


def list_symbols(path: str, include_dynamic: bool = True, limit: int = 2000) -> dict:
    elf = _open(path)
    syms: list[dict] = []
    for section in elf.iter_sections():
        if not isinstance(section, SymbolTableSection):
            continue
        table = "dynsym" if section["sh_type"] == "SHT_DYNSYM" else "symtab"
        if not include_dynamic and table == "dynsym":
            continue
        for sym in section.iter_symbols():
            syms.append(_symbol_dict(sym, table))
            if limit > 0 and len(syms) >= limit:
                return {"symbols": syms, "truncated": True, "total": len(syms)}
    return {"symbols": syms, "truncated": False, "total": len(syms)}


def find_symbols(path: str, name: str, exact: bool = False, limit: int = 200) -> list[dict]:
    elf = _open(path)
    out: list[dict] = []
    needle = name.lower()
    for section in elf.iter_sections():
        if not isinstance(section, SymbolTableSection):
            continue
        table = "dynsym" if section["sh_type"] == "SHT_DYNSYM" else "symtab"
        for sym in section.iter_symbols():
            hit = sym.name == name if exact else needle in sym.name.lower()
            if hit:
                out.append(_symbol_dict(sym, table))
                if limit > 0 and len(out) >= limit:
                    return out
    return out
