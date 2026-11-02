# decomp-workflow
purpose: Guide for moving from disassembly to reconstruction and for separating what is proven from what is heuristic.

## Tres niveles distintos
1. **Desensamblado**: instrucciones reales decodificadas desde bytes. Evidencia directa.
2. **Reconstruccion / pseudo-C**: estructura inferida (CFG, stack, parametros, loops). Heuristica, no codigo fuente original.
3. **Descompilacion verificable**: codigo que compila y reproduce el binario. Requiere build y comparacion, no solo lectura.

No mezclar niveles en un informe. `reconstruct_function` devuelve `pseudocodeKind: "heuristic-pseudocode"`, `method: "structural-heuristic"` y `limitations`.

## Procedimiento
1. Desensamblar el rango exacto con `mips_disassemble` (arquitectura y endianness correctos).
2. Analizar con `mips_analyze_function`: frame, registros guardados, llamadas, bloques.
3. Reconstruir con `reconstruct_function` y leer `limitations` antes de usar la salida.
4. Contrastar con el ELF: simbolos, relocaciones, secciones.
5. Si se genera C, compilar y comparar; sin esa comparacion no hay equivalencia.
6. Registrar en el grafo que el resultado es heuristico.

## Reglas
- No presentar pseudo-C como codigo original.
- No afirmar que una funcion "hace X" solo porque su nombre lo sugiere.
- Toda equivalencia N64/PS2 requiere evidencia y `equivalence_record`.
- Respetar la licencia del proyecto de decomp: no copiar codigo GPL a un repo MIT.

## Limites
- El reconstrucor cubre MIPS III/R5900 basico; no MMI, VU ni macro mode.
- No reconstruye tipos, structs ni firmas reales.
- Los loops se detectan por back-edges; loops irreducibles quedan sin clasificar.
