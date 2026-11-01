# Propiedad de rutas

Un archivo tiene un dueño. Cambios ajenos van por `REQUESTS/`.

| Ruta | Dueño | Contenido |
|---|---|---|
| `src/*.ts`, `src/tools/**`, `src/registry/**`, `src/security/**` | `core` | Servidor MCP, registro de tools, validación, seguridad, logging |
| `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts` | `core` | Configuración del proyecto Node |
| `src/python/**` | `analysis` | Sidecar de análisis (MIPS, ELF, ROM, memoria, gráficos, audio) |
| `tests/python/**` | `analysis` | Tests del sidecar |
| `contracts/**` | `analysis` | Contrato TS↔Python y catálogo de tools |
| `docs/analysis/**` | `analysis` | Guías de análisis |
| `docs/coordination/**` | compartido (append) | Tareas, decisiones, pedidos |
| `skills/**` | `skills` | Skills operativas por subsistema |
| `install/**`, `scripts/install*` | `core` | Instaladores OpenCode / Claude Code / Codex |
| `docs/clients/**` | `core` | Guías de los tres clientes |

## Frontera técnica acordada

El servidor TypeScript **no implementa** parsing binario propio. Delega en el sidecar
Python por el protocolo de `contracts/sidecar.protocol.md`. El sidecar no conoce MCP:
recibe JSON, devuelve JSON.
