# Coordination board

Owners update this file. One line per tool, only when it is implemented AND tested.

## Implemented and tested

| Tool | Module | Owner | Test |
| --- | --- | --- | --- |
| (none yet) | | | |

## In progress (claim before starting)

| Tool | Module | Owner | Started |
| --- | --- | --- | --- |
| mips_disassemble | src/mips/disasm.ts | ts-core | 2026-11-01 |
| elf_inspect, elf_list_sections, elf_list_segments, elf_list_symbols, elf_find_function | src/parsers/elf.ts | ts-core | 2026-11-01 |
| rom_inspect, rom_identify_format, rom_extract_metadata, rom_compare, rom_find_code_regions | src/parsers/n64rom.ts | ts-core | 2026-11-01 |

## Conventions

- Claim a tool here before implementing it, so two agents never build the same function twice.
- Remove the claim line when the tool is listed under "Implemented and tested".
