# Tabla de tareas

Estados: `planned` · `claimed` · `in-review` · `done` · `blocked`.
Cada agente agrega y actualiza **solo sus propias filas**.

| ID | Tarea | Dueño | Rama | Estado | Nota |
|---|---|---|---|---|---|
| F1-core | Servidor MCP STDIO, config, logger, registro y validación de tools | core | master | done | Servidor MCP TS funcional en `src/index.ts` con 34 tools |
| F1-sidecar | Contrato TS↔Python + sidecar Python (RPC, env.probe, mips, elf, rom, memory) | analysis | work/analysis | claimed | sin dependencia del core |
| F1-contracts | Catálogo de tools + protocolo del sidecar | analysis | work/analysis | claimed | |
| F1-diag | Diagnóstico de instalación (toolchain, binutils, PCSX2, capstone) | analysis | work/analysis | claimed | `env.probe` / `scripts/probe.mjs` |
| F2-repo | Repository intelligence (índice, búsqueda, dependencias, build info) | core | master | done | `src/repo/intel.ts` + `src/tools/repo.ts` |
| F3-elf | ELF inspect/sections/symbols/resolve | analysis | work/analysis | claimed | pyelftools |
| F3-mips | Disassembler R4300i/R5900 + análisis de función | analysis | work/analysis | claimed | capstone |
| F3-rom | Identificación/formato/segmentos de ROM N64 | analysis | work/analysis | claimed | solo lectura |
| F4-memory | Resolución de direcciones, regiones, chequeo de punteros | analysis | work/analysis | claimed | mapas documentados |
| F5-gfx | RDP/RSP, GS, texturas | core | master | done | `src/graphics/texture.ts` + `src/tools/graphics.ts` |
| F5-audio | N64 audio, SPU2/VAG | core | master | done | `src/audio/formats.ts` + `src/tools/audio.ts` |
| F6-graph | Grafo de conocimiento y correlación | core | master | done | `src/knowledge/graph.ts` + `src/tools/graph.ts` |
| F7-clients | Instaladores OpenCode / Claude Code / Codex | core | master | done | `configs/` y documentación multicliente |
| F8-validate | Suite completa, seguridad, documentación | ambos | master | done | 20 tests TS (vitest) + 40 tests Python (pytest) |
