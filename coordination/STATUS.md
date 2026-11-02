# Coordination board

Owners update this file. One line per tool, only when it is implemented AND tested.

## Implemented and tested

| Tool | Module | Owner | Test |
| --- | --- | --- | --- |
| retrace_probe, retrace_skill_list, retrace_skill_read, retrace_limits | src/tools/system.ts | ts-core | scripts/probe.mjs |
| rom_inspect, rom_identify_format, rom_find_code_regions, rom_compare | src/parsers/n64rom.ts | ts-core | tests/ts/parsers.test.ts, tests/python/test_rom.py |
| elf_inspect, elf_list_sections, elf_list_symbols, elf_find_function | src/parsers/elf.ts | ts-core | tests/ts/parsers.test.ts, tests/python/test_elf.py |
| mips_disassemble, mips_analyze_function | src/mips/disasm.ts, src/mips/analysis.ts | ts-core | tests/python/test_mips.py |
| repo_inspect, repo_search_code, repo_find_dependencies, repo_get_file_history | src/repo/intel.ts | ts-core | tests/python/test_repo.py, vitest |
| memory_inspect_region, memory_check_alignment, memory_analyze_overlap, crash_analyze | src/memory/forensics.ts | ts-core | tests/ts/memory.test.ts, tests/python/test_memory_tools.py |
| texture_inspect, texture_analyze_palette, texture_decode_n64 | src/graphics/texture.ts | ts-core | tests/ts/graphics.test.ts |
| audio_inspect, audio_decode_vag_block | src/audio/formats.ts | ts-core | tests/ts/audio.test.ts |
| decomp_config_inspect, decomp_config_validate, decomp_config_propose_changes, decomp_config_apply_changes | src/config/decomp.ts | ts-core | tests/ts/decomp.test.ts |
| graph_node_upsert, graph_edge_upsert, graph_query_neighbors | src/knowledge/graph.ts | ts-core | tests/ts/graph.test.ts |
| generate_forensic_report | src/reports/report.ts, src/tools/report.ts | codex | tests/ts/report.test.ts |
| build_analyze | src/build/analysis.ts, src/tools/build.ts | codex | tests/ts/build.test.ts |
| repo_get_architecture | src/repo/intel.ts, src/tools/repo.ts | codex | tests/ts/repo.test.ts |
| repo_find_references | src/tools/repo.ts | codex | tests/ts/repo.test.ts |
| mips_reconstruct_function | src/mips/decompile.ts, src/tools/mips.ts | ts-core | tests/ts/decompile.test.ts |
| compare_functions, compare_rank, equivalence_record, equivalence_list | src/compare/engine.ts, src/compare/registry.ts, src/tools/compare.ts | ts-core | tests/ts/compare.test.ts |
| texture_decode_ps2 | src/graphics/ps2.ts, src/tools/graphics.ts | ts-core | tests/ts/ps2.test.ts |
| audio_decode_file | src/audio/decode.ts, src/tools/audio.ts | ts-core | tests/ts/audio-decode.test.ts |
| graph_ingest | src/knowledge/ingest.ts, src/tools/graph.ts | ts-core | tests/ts/ingest.test.ts |
| build_run | src/build/run.ts, src/tools/build.ts | ts-core | tests/ts/build.test.ts |
| binary_translate, port_project_plan, port_validate_translation | src/port/porting.ts, src/tools/port.ts | codex | tests/ts/port.test.ts |
| project_intake, rom_validate, toolchain_probe | src/tools/intake.ts, src/adapters/registry.ts | codex | tests/ts/intake.test.ts |
| analyze_n64_rom, split_rom, ghidra_import, recompile_rom, generate_ps2_project, build_ps2, save_finding | src/tools/automation.ts | codex | tests/ts/automation.test.ts |
| ghidra_analyze, decompile_function, diff_function, create_ps2_project, run_pcsx2 | src/tools/automation.ts | codex | tests/ts/automation.test.ts |

## In progress (claim before starting)

| Tool | Module | Owner | Started |
| --- | --- | --- | --- |
| (none currently claimed) | | | |

## Conventions

- Claim a tool here before implementing it, so two agents never build the same function twice.
- Remove the claim line when the tool is listed under "Implemented and tested".
