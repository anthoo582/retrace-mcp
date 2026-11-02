# Changelog

All notable changes to retrace-mcp will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-01

### Added
- `mips_reconstruct_function`: CFG, stack frame, parámetros, loops y pseudo-C heurístico.
- Motor de comparación N64/PS2 (`compare_functions`, `compare_rank`) con niveles
  `exact|structural|probable|unknown`; nunca afirma equivalencia confirmada.
- `equivalence_record` / `equivalence_list`: registro atribuible y con evidencia.
- `texture_decode_ps2`: deswizzle GS (CT32/CT16/CT16S/T8/T4) y CLUT CSM2.
- `audio_decode_file`: VAG/VAGi y N64 VADPCM con codebook leído del AIFC.
- `graph_ingest`: ELF, ROM N64 y tablas de símbolos al Knowledge Graph.
- `build_run`: allowlist, `shell:false`, timeout y política de escritura.
- 6 skills nuevas (11 en total) y documentación de arquitectura, tools, integraciones,
  comparador, grafo, auditoría y roadmap.

### Fixed
- `retrace_probe` reportaba una versión hardcodeada; ahora usa `src/version.ts`.
- Tabla N64 ADPCM fija e incorrecta eliminada; el codebook lo define el archivo AIFC.
- Nibbles del control VADPCM (scale/predictor) y decodificación por vectores de 8.
- README y conteos de herramientas desactualizados.

### Changed
- Versión 0.3.0 en `package.json`, servidor MCP y probe.
- ADR-005: TypeScript es la implementación principal; Python queda como sidecar.

## [0.2.0] - 2026-11-01

### Added - Phase 4: Memory Forensics
- **9 new memory analysis tools:**
  - `memory_analyze_dump`: analyze binary memory dumps with statistics
  - `memory_inspect_region`: inspect specific memory region (hex, uint32s, strings)
  - `memory_find_pointer`: search for address references
  - `memory_check_alignment`: verify address alignment (MIPS 4-byte requirement)
  - `memory_analyze_overlap`: detect overlapping memory regions
  - `crash_analyze`: parse crash logs (PCSX2 format supported)
  - `crash_resolve_address`: resolve addresses to nearest symbols

- **Memory parser (`parsers/memory.py`):**
  - `MemoryDump` class: dump operations, pattern search, endian-aware reads
  - `CPURegisters`: MIPS register storage (R4300i/R5900)
  - `CrashContext`: crash state with registers, stack, fault information
  - `parse_pcsx2_crash`: PCSX2 crash log parser
  - `analyze_pointer`: detect null/misaligned/invalid pointers
  - `extract_stack_trace`: return address extraction from stack dumps

- **13 new comprehensive tests** for memory forensics tools
  - Tests for dump analysis, crash parsing, pointer validation
  - All tests passing (40 total)

### Changed - Breaking: MCP SDK Migration
- **Migrated from MCP SDK v1 to v2:**
  - `FastMCP` → `MCPServer` (`mcp.server.mcpserver`)
  - `mcp.run()` → `anyio.run(stdio_server, mcp)`
  - Updated tool registration to use explicit names
  - Removed `instructions` parameter (moved to protocol-level)

- Updated dependencies:
  - `mcp>=2.3.0` (was `>=1.28.0`)
  - All MCP v2 dependencies (anyio, httpx2, etc.)

### Fixed
- Tool registration now compatible with MCP v2 protocol
- STDIO transport properly initialized with anyio

## [0.1.0] - 2026-11-01

### Added - Initial Release
- **Core MCP server implementation:**
  - Full MCP protocol support via SDK
  - STDIO transport (primary)
  - HTTP transport support (optional)
  - Structured error handling with typed error codes
  - Security layer (path traversal protection, size limits)
  - Configuration system (env vars + retrace.json)

- **15 analysis tools across 4 subsystems:**

  **Repository Intelligence (5 tools):**
  - `repo_inspect`: project tree, languages, build systems
  - `repo_search_code`: regex search in source code
  - `repo_get_build_info`: build system detection
  - `repo_find_dependencies`: dependency extraction
  - `repo_find_references`: symbol reference search

  **ROM Analysis - N64 (4 tools):**
  - `rom_identify_format`: byte order detection (z64/v64/n64)
  - `rom_inspect`: comprehensive ROM summary
  - `rom_extract_metadata`: N64 header extraction
  - `rom_list_segments`: ROM region mapping

  **ELF Analysis - PS2 (5 tools):**
  - `elf_inspect`: ELF header analysis
  - `elf_list_sections`: section enumeration
  - `elf_list_segments`: program headers
  - `elf_list_symbols`: symbol table extraction
  - `elf_find_function`: function search by name

  **MIPS Disassembly (1 tool):**
  - `mips_disassemble`: R4300i (N64) and R5900 (PS2) support

- **Binary parsers:**
  - ROM parser: N64 byte order normalization, header parsing
  - ELF parser: pyelftools-based, PS2/MIPS aware
  - Capstone adapter: MIPS32/64 big/little endian

- **27 comprehensive tests** covering all parsers and tools
  - All tests passing with synthetic fixtures (no game data)

- **Multi-client MCP configurations:**
  - OpenCode: `configs/opencode.json`
  - Claude Desktop: `configs/claude.mcp.json`
  - Codex: `configs/codex.config.toml`

- **Documentation:**
  - Comprehensive README with architecture overview
  - Multi-agent coordination protocol (AGENTS.md, PROTOCOL.md)
  - Architectural decision records (ADR-001 to ADR-004)
  - Phase 0 audit document (FASE0-AUDITORIA.md)

### Security
- Path traversal protection on all file operations
- 256 MiB file size limit (configurable)
- Binaries treated as untrusted data (never executed)
- Read-only mode by default
- External tool sandboxing

## Roadmap

### Phase 5 - Graphics & Audio (Planned)
- N64 RDP/RSP analysis
- PS2 GS analysis
- Texture format conversion & inspection
- Palette analysis
- Audio format analysis (N64/PS2)

### Phase 6 - Knowledge Graph (Planned)
- Function relationship mapping
- Symbol dependencies
- Crash correlation
- Investigation history
- Evidence linking

### Phase 7 - Multi-Client Validation (Planned)
- Verified OpenCode integration
- Verified Claude Desktop integration
- Verified Codex integration
- Diagnostic tooling

---

[0.2.0]: https://github.com/anthoo582/retrace-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/anthoo582/retrace-mcp/releases/tag/v0.1.0
