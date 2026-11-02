# Arquitectura de Retrace MCP

## Decision vigente
El servidor MCP TypeScript (`src/index.ts`) es la implementacion de referencia. El arbol
Python (`src/retrace_mcp/**`, `src/python/retrace_analysis/**`) se conserva como sidecar de
analisis. Ver `docs/coordination/DECISIONS.md`, ADR-005.

## Capas

| Capa | Ruta | Responsabilidad |
| --- | --- | --- |
| Transporte MCP | `src/index.ts` | Registra tools y conecta stdio |
| Tools | `src/tools/**` | Validacion de entrada, permisos, respuestas `ok/fail` |
| Dominio | `src/mips`, `src/parsers`, `src/graphics`, `src/audio`, `src/memory`, `src/build`, `src/compare`, `src/knowledge` | Analisis puro, sin I/O de red |
| Infra | `src/security/paths.ts`, `src/core/exec.ts`, `src/config.ts` | Rutas, ejecucion sin shell, limites |
| Evidencia | `src/core/evidence.ts` | Formato uniforme de resultado |
| Sidecar | `src/python/**` | Capstone/pyelftools opcionales |

## Flujo de una tool
1. `registerTool` valida el esquema Zod y captura errores en `fail(code, message)`.
2. La tool resuelve rutas con `resolveInWorkspace` (nunca acepta rutas fuera de los roots).
3. Lee con `readFileCapped` (limite `RETRACE_MAX_FILE_BYTES`).
4. El motor devuelve datos + `evidence` + `limitations`.
5. Escrituras solo con `RETRACE_ALLOW_WRITE=1`, `apply/confirm=true` y `writeFileGuarded`.

## Modelo de certeza
- `confirmed`: solo con evidencia registrada (`equivalence_record`).
- `very_likely` / `possible` / `insufficient`: heuristicas explicitas.
- Un nombre de simbolo no es evidencia de comportamiento.

## Limites deliberados
- Nada de ROMs, BIOS, ISOs ni assets en el repo.
- Nada de ejecucion arbitraria: `build_run` usa allowlist, `shell:false` y timeout.
- Nada de parsers simulados: lo no implementado devuelve `UNSUPPORTED` o error explicito.
