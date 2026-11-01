"""Synthetic ELF fixtures built in memory. No real binaries are stored in git."""

from __future__ import annotations

import struct


def build_mips_elf(
    *,
    little_endian: bool = False,
    entry: int = 0x80000000,
    text: bytes = b"",
    symbols: tuple[tuple[str, int, int], ...] = (),
) -> bytes:
    """Return a minimal ET_EXEC MIPS ELF32 with .text and a symbol table.

    ``symbols`` is a tuple of (name, value, size) for STT_FUNC entries placed in
    section 1 (.text).
    """

    if not text:
        text = struct.pack(">IIII", 0x27BDFFE0, 0xAFBF001C, 0x00000000, 0x03E00008)
    order = "<" if little_endian else ">"
    ident = b"\x7fELF" + bytes([1, 1 if little_endian else 2, 1, 0]) + b"\x00" * 8

    strtab = bytearray(b"\x00")
    sym_entries = [b"\x00" * 16]
    for name, value, size in symbols:
        name_offset = len(strtab)
        strtab += name.encode("ascii") + b"\x00"
        sym_entries.append(struct.pack(order + "IIIBBH", name_offset, value, size, 0x12, 0x00, 1))
    symtab = b"".join(sym_entries)

    shstrtab = bytearray(b"\x00")
    name_offsets = {}
    for section_name in (".text", ".symtab", ".strtab", ".shstrtab"):
        name_offsets[section_name] = len(shstrtab)
        shstrtab += section_name.encode("ascii") + b"\x00"

    ehsize = 52
    text_offset = ehsize
    symtab_offset = text_offset + len(text)
    strtab_offset = symtab_offset + len(symtab)
    shstrtab_offset = strtab_offset + len(strtab)
    shoff = shstrtab_offset + len(shstrtab)
    shoff += (-shoff) % 4

    shnum = 5
    ehdr = ident + struct.pack(
        order + "HHIIIIIHHHHHH",
        2,            # e_type ET_EXEC
        8,            # e_machine EM_MIPS
        1,            # e_version
        entry,        # e_entry
        0,            # e_phoff
        shoff,        # e_shoff
        0x30001000,   # e_flags: EF_MIPS_ARCH_3 | EF_MIPS_ABI_O32
        ehsize,       # e_ehsize
        0,            # e_phentsize
        0,            # e_phnum
        40,           # e_shentsize
        shnum,        # e_shnum
        4,            # e_shstrndx
    )

    def section(name_off: int, kind: int, flags: int, addr: int, offset: int, size: int,
                link: int = 0, info: int = 0, align: int = 0, entsize: int = 0) -> bytes:
        return struct.pack(
            order + "IIIIIIIIII",
            name_off, kind, flags, addr, offset, size, link, info, align, entsize,
        )

    sections = b"".join([
        b"\x00" * 40,
        section(name_offsets[".text"], 1, 0x6, 0x80000000, text_offset, len(text), align=4),
        section(name_offsets[".symtab"], 2, 0, 0, symtab_offset, len(symtab), link=3, info=1, align=4, entsize=16),
        section(name_offsets[".strtab"], 3, 0, 0, strtab_offset, len(strtab), align=1),
        section(name_offsets[".shstrtab"], 3, 0, 0, shstrtab_offset, len(shstrtab), align=1),
    ])

    blob = bytearray(ehdr + text + symtab + bytes(strtab) + bytes(shstrtab))
    blob += b"\x00" * (shoff - len(blob))
    blob += sections
    return bytes(blob)
