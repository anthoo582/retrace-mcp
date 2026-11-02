# Auditoria del repositorio

## Estado verificado (0.3.0)
- `npm run typecheck`: limpio.
- `npm test`: 59 tests en 15 archivos, todos pasan.
- `python -m pytest tests -q`: suite Python intacta (40 tests).
- Arbol TypeScript: 47 tools registradas.

## Hallazgos corregidos
| Hallazgo | Correccion |
| --- | --- |
| `retrace_probe` reportaba `0.1.0` hardcodeado | Version unica en `src/version.ts` |
| `package.json` y servidor en `0.2.0` | `0.3.0` |
| Tabla N64 ADPCM fija e incorrecta en `audio/formats.ts` | Eliminada; el codebook se lee del AIFC |
| Control byte VADPCM con nibbles invertidos | Corregido: scale alto, predictor bajo |
| Frame VADPCM decodificado como 16 taps planos | Corregido: dos vectores de 8 con estado |
| `texture_decode_ps2` inexistente | Motor GS con swizzle y CLUT CSM2 |
| Sin comparador N64/PS2 | `src/compare/*` con niveles y registro de evidencia |
| Sin ingestion al grafo | `graph_ingest` para ELF, ROM y symbol tables |
| Sin ejecucion de build controlada | `build_run` con allowlist y `shell:false` |

## Hallazgos abiertos
- CLUT CSM1 no se decodifica: se rechaza explicitamente. Falta un dump de referencia.
- Swizzle GS validado por round-trip y estructura de paginas, no contra VRAM real.
- PSMCT24 y modos H/L se reportan como no implementados.
- Faltan ROM/ELF reales para validar heuristicas de comparacion.
- README y conteos historicos mezclaban el arbol TS y Python; corregido en 0.3.0.

## Reglas respetadas
- No se borro el arbol Python ni tools existentes.
- No se agregaron ROMs, BIOS ni assets.
- Lo no implementado devuelve error explicito, no datos simulados.
