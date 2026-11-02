# retrace-mcp

Servidor **Model Context Protocol** especializado en ingeniería inversa de
videojuegos clásicos: análisis de ROMs de **Nintendo 64**, ejecutables ELF de
**PlayStation 2**, ensamblador **MIPS** (R4300i y R5900), memoria, gráficos y
audio. Permite que un agente de IA investigue un binario, entienda su
arquitectura, identifique funciones y reconstruya estructuras con evidencia
verificable.

> **Estado:** v0.6.0.
> - Servidor TypeScript (`src/index.ts`): **47 herramientas** registradas, Stdio transport, **59 tests vitest** pasando.
> - Sidecar Python (`src/retrace_mcp`): 24 herramientas, 40 tests pytest pasando.
> - Diagnóstico: `npm run probe` (`scripts/probe.mjs`).
> - Runtimes verificados: Node.js >= 20 y Python >= 3.10.
> - Decisión de stack: TypeScript es la implementación principal (ADR-005).

---

## Qué ofrece

| Subsistema | Herramientas | Estado |
|---|---|---|
| Sistema | `retrace_probe`, `retrace_skill_list`, `retrace_skill_read`, `retrace_limits` | ✅ |
| Repository | `repo_inspect`, `repo_get_architecture`, `repo_search_code`, `repo_find_references`, `repo_find_dependencies`, `repo_get_file_history` | ✅ |
| ROM (N64) | `rom_inspect`, `rom_identify_format`, `rom_find_code_regions`, `rom_compare` | ✅ |
| ELF (PS2/MIPS) | `elf_inspect`, `elf_list_sections`, `elf_list_symbols`, `elf_find_function` | ✅ |
| MIPS | `mips_disassemble`, `mips_analyze_function`, `mips_reconstruct_function` | ✅ |
| Comparación N64/PS2 | `compare_functions`, `compare_rank`, `equivalence_record`, `equivalence_list` | ✅ |
| Portabilidad N64/PS2 | `port_project_plan`, `binary_translate`, `port_validate_translation` | ✅ |
| Intake y toolchains | `project_intake`, `rom_validate`, `toolchain_probe` | ✅ |
| Orquestación MVP | `analyze_n64_rom`, `split_rom`, `ghidra_import`, `recompile_rom`, `generate_ps2_project`, `build_ps2`, `save_finding` | ✅ |
| Memoria / crashes | `memory_inspect_region`, `memory_check_alignment`, `memory_analyze_overlap`, `crash_analyze` | ✅ |
| Gráficos | `texture_inspect`, `texture_analyze_palette`, `texture_decode_n64`, `texture_decode_ps2` | ✅ |
| Audio | `audio_inspect`, `audio_decode_vag_block`, `audio_decode_file` | ✅ |
| Decomp config | `decomp_config_inspect`, `decomp_config_validate`, `decomp_config_propose_changes`, `decomp_config_apply_changes` | ✅ |
| Knowledge graph | `graph_node_upsert`, `graph_edge_upsert`, `graph_query_neighbors`, `graph_ingest` | ✅ |
| Reportes / build | `generate_forensic_report`, `build_analyze`, `build_run` | ✅ |

**Total:** 60 herramientas TypeScript implementadas y testeadas.

Documentación: [arquitectura](docs/ARCHITECTURE.md), [tools](docs/TOOLS.md),
[skills](docs/SKILLS.md), [comparador](docs/COMPARISON_ENGINE.md),
[grafo](docs/KNOWLEDGE_GRAPH.md), [integraciones](docs/INTEGRATIONS.md),
[auditoría](docs/AUDIT.md) y [roadmap](docs/ROADMAP.md).

Investigación web y hoja de ruta: [Portabilidad N64 a PS2](reports/Portabilidad%20N64%20a%20PS2.md).

Cada herramienta devuelve un JSON estructurado `{ "ok": true, "data": ... }` o
`{ "ok": false, "error": { "code", "message" } }`.

---

## Requisitos

- Python **3.10+**
- Dependencias declaradas en `pyproject.toml`:
  - `mcp` (SDK oficial)
  - `capstone` (desensamblador MIPS)
  - `pyelftools` (análisis ELF)
  - `construct` (parsing binario)
- Extras opcionales: `graphics` (Pillow), `radare2` (r2pipe), `http` (uvicorn/starlette).

Herramientas externas opcionales (se detectan en tiempo de ejecución, nunca se
simulan): `binutils` MIPS (`readelf`/`objdump`/`nm`/`strings`), radare2, Ghidra.

---

## Instalación

```bash
git clone https://github.com/anthoo582/retrace-mcp.git
cd retrace-mcp
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -e .
```

Verifica que el servidor arranca (responde el handshake MCP y se mantiene a la
espera):

```bash
python -m retrace_mcp --transport stdio
```

---

## Conexión a los clientes

Configuraciones listas en [`configs/`](configs/):

- **OpenCode** — [`configs/opencode.json`](configs/opencode.json) (copia el bloque `mcp.retrace` a tu `opencode.json`).
- **Claude Code** — [`configs/claude.mcp.json`](configs/claude.mcp.json) (renómbralo a `.mcp.json` en la raíz del proyecto, o usa `claude mcp add`).
- **Codex** — [`configs/codex.config.toml`](configs/codex.config.toml) (fusiona el bloque `[mcp_servers.retrace]` en `~/.codex/config.toml`).

Guías paso a paso en [`docs/installation.md`](docs/installation.md).

---

## Uso

Con el servidor conectado, el agente dispone de las herramientas como
`repo_inspect`, `elf_inspect`, `mips_disassemble`, etc. Ejemplos:

- *"Inspecciona el ELF y lista sus símbolos."* → `elf_inspect` + `elf_list_symbols`.
- *"Identifica el formato de esta ROM N64."* → `rom_identify_format`.
- *"Desensambla la función en 0x80000400 como R4300i."* → `mips_disassemble`.
- *"Busca referencias a `main_func` en el código."* → `repo_find_references`.
- *"Prepara un port de N64 a PS2 y traduce estas palabras MIPS."* → `port_project_plan` + `binary_translate` + `port_validate_translation`.
- *"¿Qué tengo instalado y puedo empezar?"* → `project_intake` + `rom_validate` + `toolchain_probe`.

---

## Arquitectura

Véase [`docs/architecture.md`](docs/architecture.md). Resumen:

```
src/retrace_mcp/
├── server.py          # ensamblado y arranque (stdio / http)
├── registry.py        # instancia FastMCP + decorador @tool con errores tipados
├── config.py          # configuración (env / retrace.json)
├── security.py        # path traversal, límites de tamaño, binarios no confiables
├── errors.py          # excepciones tipadas
├── adapters/          # herramientas externas (capstone, binutils, ...)
├── parsers/           # rom.py, elf.py (formato binario)
└── tools/             # herramientas MCP por subsistema
```

---

## Seguridad

- Toda lectura pasa por validación de ruta (protección contra *path traversal*) y límite de tamaño.
- Los binarios analizados se tratan como **datos no confiables**: nunca se ejecuta código extraído de una ROM, ELF o dump.
- Las herramientas externas solo invocan binarios conocidos con argumentos validados y límite de tiempo.
- No se sobrescriben archivos originales; las operaciones destructivas requieren autorización explícita.

---

## Licencia

MIT. Véase [LICENSE](LICENSE).
