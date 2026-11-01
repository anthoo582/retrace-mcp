# retrace-mcp

Servidor **Model Context Protocol** especializado en ingeniería inversa de
videojuegos clásicos: análisis de ROMs de **Nintendo 64**, ejecutables ELF de
**PlayStation 2**, ensamblador **MIPS** (R4300i y R5900), memoria, gráficos y
audio. Permite que un agente de IA investigue un binario, entienda su
arquitectura, identifique funciones y reconstruya estructuras con evidencia
verificable.

> **Estado:** v0.2.0 beta. Fase 0 (repositorio + ROM + ELF + MIPS) y Fase 4
> (memoria forense + crashes) completas. 24 herramientas, 40 tests pasando.
> Migrado a MCP SDK v2 (MCPServer).
> Fases pendientes: gráficos/audio (Fase 5), knowledge graph (Fase 6).

---

## Qué ofrece

| Subsistema | Herramientas | Estado |
|---|---|---|
| Repository | `repo_inspect`, `repo_search_code`, `repo_get_build_info`, `repo_find_dependencies`, `repo_find_references` | ✅ |
| ROM (N64) | `rom_identify_format`, `rom_inspect`, `rom_extract_metadata`, `rom_list_segments` | ✅ |
| ELF (PS2/MIPS) | `elf_inspect`, `elf_list_sections`, `elf_list_segments`, `elf_list_symbols`, `elf_find_function` | ✅ |
| MIPS | `mips_disassemble` | ✅ |
| Memoria / crashes | `memory_analyze_dump`, `memory_inspect_region`, `memory_find_pointer`, `memory_check_alignment`, `memory_analyze_overlap`, `crash_analyze`, `crash_resolve_address` | ✅ |
| Gráficos / audio | planificado | 🚧 |
| Knowledge graph | planificado | 🚧 |

**Total:** 24 herramientas implementadas

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
