# Tabla de tareas

Estados: `planned` · `claimed` · `in-review` · `done` · `blocked`.
Cada agente agrega y actualiza **solo sus propias filas**.

| ID | Tarea | Dueño | Rama | Estado | Nota |
|---|---|---|---|---|---|
| F1-core | Servidor MCP STDIO, config, logger, registro y validación de tools | core | | claimed | |
| F1-sidecar | Contrato TS↔Python + sidecar Python (RPC, env.probe, mips, elf, rom, memory) | analysis | work/analysis | claimed | sin dependencia del core |
| F1-contracts | Catálogo de tools + protocolo del sidecar | analysis | work/analysis | claimed | |
| F1-diag | Diagnóstico de instalación (toolchain, binutils, PCSX2, capstone) | analysis | work/analysis | claimed | `env.probe` |
| F2-repo | Repository intelligence (índice, búsqueda, dependencias, build info) | core | | planned | consume sidecar solo si hace falta |
| F3-elf | ELF inspect/sections/symbols/resolve | analysis | work/analysis | claimed | pyelftools |
| F3-mips | Disassembler R4300i/R5900 + análisis de función | analysis | work/analysis | claimed | capstone |
| F3-rom | Identificación/formato/segmentos de ROM N64 | analysis | work/analysis | claimed | solo lectura |
| F4-memory | Resolución de direcciones, regiones, chequeo de punteros | analysis | work/analysis | claimed | mapas documentados |
| F5-gfx | RDP/RSP, GS, texturas | analysis | | planned | |
| F5-audio | N64 audio, SPU2/VAG | analysis | | planned | |
| F6-graph | Grafo de conocimiento y correlación | core | | planned | |
| F7-clients | Instaladores OpenCode / Claude Code / Codex | core | | planned | |
| F8-validate | Suite completa, seguridad, documentación | ambos | | planned | |
