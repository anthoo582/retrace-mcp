# Catálogo de tools (TypeScript)

Este archivo se genera desde el registro efectivo de src/tools. Total: **76 tools**.
Todas devuelven un sobre `{ ok, data|error, evidence }`.

## audio.js

**3 tools:** `audio_decode_file`, `audio_decode_vag_block`, `audio_inspect`.

## automation.js

**12 tools:** `analyze_n64_rom`, `build_ps2`, `create_ps2_project`, `decompile_function`, `diff_function`, `generate_ps2_project`, `ghidra_analyze`, `ghidra_import`, `recompile_rom`, `run_pcsx2`, `save_finding`, `split_rom`.

## autopilot.js

**2 tools:** `project_autopilot`, `project_state`.

## build.js

**2 tools:** `build_analyze`, `build_run`.

## compare.js

**4 tools:** `compare_functions`, `compare_rank`, `equivalence_list`, `equivalence_record`.

## decomp.js

**4 tools:** `decomp_config_apply_changes`, `decomp_config_inspect`, `decomp_config_propose_changes`, `decomp_config_validate`.

## elf.js

**4 tools:** `elf_find_function`, `elf_inspect`, `elf_list_sections`, `elf_list_symbols`.

## graph.js

**4 tools:** `graph_edge_upsert`, `graph_ingest`, `graph_node_upsert`, `graph_query_neighbors`.

## graphics.js

**4 tools:** `texture_analyze_palette`, `texture_decode_n64`, `texture_decode_ps2`, `texture_inspect`.

## intake.js

**3 tools:** `project_intake`, `rom_validate`, `toolchain_probe`.

## memory.js

**4 tools:** `crash_analyze`, `memory_analyze_overlap`, `memory_check_alignment`, `memory_inspect_region`.

## mips.js

**3 tools:** `mips_analyze_function`, `mips_disassemble`, `mips_reconstruct_function`.

## pipeline.js

**5 tools:** `iso_verify`, `package_ps2_iso`, `port_source_manifest`, `port_start`, `port_status`.

## port.js

**3 tools:** `binary_translate`, `port_project_plan`, `port_validate_translation`.

## repo.js

**6 tools:** `repo_find_dependencies`, `repo_find_references`, `repo_get_architecture`, `repo_get_file_history`, `repo_inspect`, `repo_search_code`.

## report.js

**1 tools:** `generate_forensic_report`.

## rom.js

**4 tools:** `rom_compare`, `rom_find_code_regions`, `rom_identify_format`, `rom_inspect`.

## system.js

**4 tools:** `retrace_limits`, `retrace_probe`, `retrace_skill_list`, `retrace_skill_read`.

## variables.js

**4 tools:** `infer_structs`, `infer_variables`, `suggest_variable_names`, `validate_variable_map`.

## Política de escritura

Solo las tools con apply=true, confirm=true o una ruta de salida explícita escriben.
El pipeline exige RETRACE_ALLOW_WRITE=1, conserva el árbol fuente y no crea una ISO
si no existe un builder real (mkisofs o genisoimage).
