# Roadmap

## Hecho en 0.3.0
- Version unica y correccion de `retrace_probe`.
- Reconstruccion heuristica de funciones (`mips_reconstruct_function`).
- Motor de comparacion N64/PS2 y registro de equivalencias confirmadas.
- Decodificacion GS: swizzle CT32/CT16/CT16S/T8/T4 y CLUT CSM2.
- Decodificacion VAG y N64 VADPCM con codebook del archivo.
- Ingestion ELF/ROM/symbols al Knowledge Graph.
- `build_run` con allowlist, timeout y politica de escritura.
- 11 skills y documentacion de arquitectura, tools, integraciones y limites.

## Proximo
1. Validar swizzle y CLUT contra un dump de GS real (requiere hardware o captura).
2. Implementar CSM1 solo con una referencia verificable.
3. Anadir soporte PSMCT24 y modos H/L si aparece evidencia.
4. Mejorar el reconstrucor: firmas, structs y llamadas indirectas.
5. Evaluar `N64Recomp` (MIT) como adaptador opcional, sin enlazar runtime GPL.
6. Cobertura de tests con binarios sinteticos mas complejos (loops irreducibles, MMI).

## Bloqueado
- Sin token valido no se puede hacer push; el token compartido debe revocarse.
- Sin ROMs/ELF reales no se pueden cerrar las validaciones marcadas como estructurales.

## No se hara
- Segundo servidor MCP.
- Ejecucion arbitraria de comandos.
- Afirmar equivalencia sin evidencia.
- Incluir datos de juegos en el repositorio.
