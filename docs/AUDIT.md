# Auditoría del repositorio

## Estado verificado (2026-11-02)

- Versión declarada: `1.0.0` en `package.json` y `src/version.ts`.
- `npm run typecheck`: limpio.
- `npm test`: 75 tests Vitest en 21 archivos, todos pasan.
- `python -m pytest tests -q`: 40 tests, todos pasan.
- Servidor TypeScript: 76 tools registradas en `src/index.ts`.
- `npm run probe`: 4 de 33 adaptadores disponibles en el entorno auditado.
- Fixtures: sintéticos; el repositorio no contiene ROMs, BIOS, ISOs ni binarios comerciales.

Los comandos, el entorno y las limitaciones se conservan en
[`docs/VERIFIED-STATUS.md`](VERIFIED-STATUS.md). Los conteos de tools y tests de
esta página deben cambiar solo junto con una nueva ejecución de esa verificación.

## Hallazgos corregidos

| Hallazgo | Corrección |
| --- | --- |
| Versiones mezcladas entre README, servidor y auditorías | `1.0.0` es la única versión declarada como actual |
| Conteos históricos de tools y tests | README, catálogo, instalación, tareas y diagramas usan 76/75/40 |
| `retrace_probe` reportaba una versión hardcodeada | Versión única en `src/version.ts` |
| Tabla N64 ADPCM fija e incorrecta | El codebook se lee del AIFC |
| Control byte VADPCM con nibbles invertidos | Corregido: scale alto, predictor bajo |
| Frame VADPCM decodificado como 16 taps planos | Corregido: dos vectores de 8 con estado |
| `texture_decode_ps2` inexistente | Motor GS con swizzle y CLUT CSM2 |
| Sin comparador N64/PS2 | Comparador con niveles y registro de evidencia |
| Sin ingestión al grafo | `graph_ingest` para ELF, ROM y tablas de símbolos |
| Sin ejecución de build controlada | `build_run` con allowlist y `shell:false` |

## Límites abiertos

- CLUT CSM1 no se decodifica: se rechaza explícitamente.
- Swizzle GS validado por round-trip y estructura de páginas, no contra VRAM real.
- PSMCT24 y modos H/L se reportan como no implementados.
- Faltan ROM/ELF reales autorizados para validar heurísticas de comparación.
- Ghidra, PCSX2, toolchains PS2, N64Recomp y binutils no están disponibles en el
  entorno auditado; las tools correspondientes devuelven `dependency_missing`.
- Los tests prueban fixtures sintéticos y contratos; no prueban compatibilidad de
  un juego comercial ni equivalencia semántica de un port.

## Reglas respetadas

- No se borra el árbol Python ni las tools existentes.
- No se agregan ROMs, BIOS, ISOs, assets de juegos ni secretos.
- Lo no implementado devuelve error explícito, no datos simulados.
