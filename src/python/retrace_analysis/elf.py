"""ELF inspection for PlayStation 2 executables and any MIPS ELF.

Uses pyelftools; no hand-rolled parser. Read-only, size-limited, and explicit
about what it can and cannot conclude (an ELF header alone does not prove which
target produced the binary).
"""

from __future__ import annotations

import hashlib
from typing import Any

from .errors import dependency_missing, invalid_params, parse_error
from .paths import checked_path

try:  # pragma: no cover
    import elftools
    from elftools.elf.elffile import ELFFile

    PYELFTOOLS_VERSION = getattr(elftools, "__version__", "unknown")
    HAVE_PYELFTOOLS = True
except Exception:  # pragma: no cover
    PYELFTOOLS_VERSION = None
    HAVE_PYELFTOOLS = False

MIPS_ARCH_NAMES = {
    1: "MIPS I",
    2: "MIPS II",
    3: "MIPS III",
    4: "MIPS IV",
    5: "MIPS V",
    6: "MIPS32",
    7: "MIPS64",
    8: "MIPS32r2",
    9: "MIPS64r2",
    10: "MIPS32r6",
    11: "MIPS64r6",
}

MIPS_ABI_NAMES = {
    0x0000: "unspecified / o32 (32-bit)",
    0x1000: "o32",
    0x2000: "o64",
    0x3000: "EABI32",
    0x4000: "EABI64",
}

HASH_LIMIT_BYTES = 64 * 1024 * 1024


def _require_pyelftools() -> None:
    if not HAVE_PYELFTOOLS:
        raise dependency_missing(
            "pyelftools is not installed in this Python environment",
            hint="pip install pyelftools",
        )


def _elf(path):
    _require_pyelftools()
    handle = path.open("rb")
    try:
        elf = ELFFile(handle)
    except Exception as exc:  # pyelftools raises several types
        handle.close()
        raise parse_error(f"not a parseable ELF: {path}", path=str(path), reason=str(exc)) from exc
    return handle, elf


def _flags_interpretation(flags: int, machine: str) -> dict[str, Any]:
    if machine != "EM_MIPS":
        return {"note": "e_flags interpretation implemented for MIPS only"}
    arch_level = (flags >> 28) & 0xF
    abi = (flags >> 12) & 0xF
    return {
        "raw": hex(flags),
        "mips_arch_level": MIPS_ARCH_NAMES.get(arch_level, f"unknown ({arch_level})"),
        "mips_abi": MIPS_ABI_NAMES.get(abi << 12, f"unknown (0x{abi << 12:04x})"),
        "note": "Derived from EF_MIPS_ARCH and EF_MIPS_ABI bits; corroborate with the toolchain before relying on it.",
    }


def inspect(params: dict[str, Any]) -> dict[str, Any]:
    path = checked_path(params.get("path"), field="path")
    handle, elf = _elf(path)
    try:
        header = elf.header
        machine = str(header["e_machine"])
        sections = []
        for section in elf.iter_sections():
            sections.append({
                "name": section.name,
                "type": section["sh_type"],
                "address": section["sh_addr"],
                "offset": section["sh_offset"],
                "size": section["sh_size"],
                "flags": section["sh_flags"],
                "entry_size": section["sh_entsize"],
            })
            if len(sections) >= 512:
                break

        segments = []
        for segment in elf.iter_segments():
            segments.append({
                "type": segment["p_type"],
                "offset": segment["p_offset"],
                "virtual_address": segment["p_vaddr"],
                "physical_address": segment["p_paddr"],
                "file_size": segment["p_filesz"],
                "memory_size": segment["p_memsz"],
                "flags": segment["p_flags"],
                "alignment": segment["p_align"],
            })
            if len(segments) >= 256:
                break

        symbols = _symbol_rows(elf)
        functions = [row for row in symbols if row["kind"] == "function"]

        result: dict[str, Any] = {
            "path": str(path),
            "size": path.stat().st_size,
            "header": {
                "elf_class": header["e_ident"]["EI_CLASS"],
                "data_encoding": header["e_ident"]["EI_DATA"],
                "os_abi": header["e_ident"]["EI_OSABI"],
                "type": header["e_type"],
                "machine": machine,
                "entry": header["e_entry"],
                "program_header_count": header["e_phnum"],
                "section_header_count": header["e_shnum"],
                "flags": _flags_interpretation(int(header["e_flags"]), machine),
            },
            "sections": sections,
            "segments": segments,
            "counts": {
                "sections": elf.num_sections(),
                "segments": elf.num_segments(),
                "symbols": len(symbols),
                "functions": len(functions),
            },
            "has_debug_info": any(section["name"] == ".debug_info" for section in sections),
            "has_symbol_table": any(section["name"] in {".symtab", ".dynsym"} for section in sections),
            "confidence": "confirmed",
            "evidence": {"source": str(path), "tool": f"pyelftools {PYELFTOOLS_VERSION}"},
            "limitations": [
                "An ELF header does not by itself prove the originating target; it reports what the file declares.",
                "Stripped binaries carry no function names; use disassembly and cross-references instead.",
            ],
        }
        if path.stat().st_size <= HASH_LIMIT_BYTES:
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            result["sha256"] = digest.hexdigest()
        else:
            result["limitations"].append("File too large to hash; sha256 omitted.")
        return result
    finally:
        handle.close()


def _symbol_rows(elf) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_sections: set[str] = set()
    for section in elf.iter_sections():
        if section.name not in {".symtab", ".dynsym"} or section.name in seen_sections:
            continue
        seen_sections.add(section.name)
        for symbol in section.iter_symbols():
            info = symbol["st_info"]
            kind_code = info["type"]
            kind = {
                "STT_FUNC": "function",
                "STT_OBJECT": "object",
                "STT_NOTYPE": "notype",
                "STT_SECTION": "section",
                "STT_FILE": "file",
                "STT_TLS": "tls",
            }.get(kind_code, str(kind_code))
            name = symbol.name
            if not name:
                continue
            rows.append({
                "name": name,
                "kind": kind,
                "value": int(symbol["st_value"]),
                "size": int(symbol["st_size"]),
                "binding": info["bind"],
                "visibility": symbol["st_other"]["visibility"],
                "section_index": symbol["st_shndx"],
                "table": section.name,
            })
    rows.sort(key=lambda row: (row["value"], row["name"]))
    return rows


def symbols(params: dict[str, Any]) -> dict[str, Any]:
    path = checked_path(params.get("path"), field="path")
    kind_filter = params.get("kind", "all")
    if kind_filter not in {"all", "function", "object", "notype", "section", "file", "tls"}:
        raise invalid_params("kind must be all|function|object|notype|section|file|tls", kind=kind_filter)
    pattern = params.get("pattern")
    if pattern is not None and not isinstance(pattern, str):
        raise invalid_params("pattern must be a string", field="pattern")
    limit = params.get("limit", 200)
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        raise invalid_params("limit must be a positive integer", field="limit")
    limit = min(limit, 5000)

    handle, elf = _elf(path)
    try:
        rows = _symbol_rows(elf)
        total = len(rows)
        if kind_filter != "all":
            rows = [row for row in rows if row["kind"] == kind_filter]
        if pattern:
            lowered = pattern.lower()
            rows = [row for row in rows if lowered in row["name"].lower()]
        return {
            "path": str(path),
            "kind": kind_filter,
            "pattern": pattern,
            "total_symbols": total,
            "matched": len(rows),
            "returned": min(len(rows), limit),
            "truncated": len(rows) > limit,
            "symbols": rows[:limit],
            "confidence": "confirmed",
            "evidence": {"source": str(path), "tool": f"pyelftools {PYELFTOOLS_VERSION}"},
        }
    finally:
        handle.close()


def resolve(params: dict[str, Any]) -> dict[str, Any]:
    path = checked_path(params.get("path"), field="path")
    address = params.get("address")
    if isinstance(address, bool) or not isinstance(address, int) or address < 0:
        raise invalid_params("address must be a non-negative integer", field="address")

    handle, elf = _elf(path)
    try:
        rows = _symbol_rows(elf)
        best = None
        for row in rows:
            if row["value"] <= address:
                if best is None or row["value"] > best["value"]:
                    best = row
        section_name = None
        for section in elf.iter_sections():
            start = int(section["sh_addr"])
            size = int(section["sh_size"])
            if size and start <= address < start + size:
                section_name = section.name
                break

        result: dict[str, Any] = {
            "path": str(path),
            "address": address,
            "section": section_name,
            "symbol": None,
            "offset": None,
            "confidence": "insufficient" if best is None else "very_likely",
            "evidence": {"source": str(path), "tool": f"pyelftools {PYELFTOOLS_VERSION}"},
            "limitations": [],
        }
        if best is not None:
            within = best["size"] == 0 or (address - best["value"]) < best["size"]
            result["symbol"] = best["name"]
            result["symbol_kind"] = best["kind"]
            result["symbol_address"] = best["value"]
            result["symbol_size"] = best["size"]
            result["offset"] = address - best["value"]
            if not within:
                result["confidence"] = "possible"
                result["limitations"].append(
                    "Address is past the symbol's declared size; nearest-symbol match only."
                )
        else:
            result["limitations"].append("No symbol with a value at or below this address.")
        return result
    finally:
        handle.close()
