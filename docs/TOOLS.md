# Catalogo de tools (TypeScript)

50 tools registradas en `src/index.ts`. Todas devuelven `{ ok, data|error, evidence }`.

## Sistema (4)
`retrace_probe`, `retrace_skill_list`, `retrace_skill_read`, `retrace_limits`.

## N64 ROM (4)
`rom_inspect`, `rom_identify_format`, `rom_find_code_regions`, `rom_compare`.

## ELF (4)
`elf_inspect`, `elf_list_sections`, `elf_list_symbols`, `elf_find_function`.

## MIPS (3)
`mips_disassemble`, `mips_analyze_function`, `mips_reconstruct_function`.

## Comparacion N64/PS2 (4)
`compare_functions`, `compare_rank`, `equivalence_record`, `equivalence_list`.

## Repositorio (6)
`repo_inspect`, `repo_get_architecture`, `repo_search_code`, `repo_find_references`,
`repo_find_dependencies`, `repo_get_file_history`.

## Memoria y crash (4)
`memory_inspect_region`, `memory_check_alignment`, `memory_analyze_overlap`, `crash_analyze`.

## Graficos (4)
`texture_inspect`, `texture_analyze_palette`, `texture_decode_n64`, `texture_decode_ps2`.

## Audio (3)
`audio_inspect`, `audio_decode_vag_block`, `audio_decode_file`.

## Decomp config (4)
`decomp_config_inspect`, `decomp_config_validate`, `decomp_config_propose_changes`,
`decomp_config_apply_changes`.

## Knowledge Graph (4)
`graph_node_upsert`, `graph_edge_upsert`, `graph_query_neighbors`, `graph_ingest`.

## Reportes y build (3)
`generate_forensic_report`, `build_analyze`, `build_run`.

## Politica de escritura
Solo `decomp_config_apply_changes`, `build_run` y `audio_decode_file` (con `outPath`)
escriben. Todas exigen `RETRACE_ALLOW_WRITE=1` y confirmacion explicita.
