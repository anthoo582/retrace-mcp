# cross-platform-porting
purpose: Guide for comparing N64 (R4300i) and PS2 (R5900) functions and for deciding what counts as porting evidence.

## Regla central
Desensamblar no es descompilar. Reconstruir no es probar equivalencia. Una equivalencia solo es `confirmed` cuando existe evidencia registrada y atribuible.

## Niveles de match
- `exact`: mismas mnemonics y formas de operandos. No prueba semantica.
- `structural`: control de flujo y clases de instruccion coinciden; pueden diferir registros y constantes.
- `probable`: forma similar con diferencias; candidato a revision manual.
- `unknown`: sin base suficiente.

`compare_functions` y `compare_rank` nunca devuelven `confirmed`. Solo `equivalence_record` lo hace, y exige `evidence`, `recordedBy` y `confirm: true`.

## Procedimiento
1. Resolver ambas funciones con direccion y tamano reales.
2. Comparar con `compare_functions`; leer `differences` y `metrics`.
3. Si el nivel es `structural` o `probable`, revisar manualmente llamadas, constantes y accesos a memoria.
4. Aportar evidencia concreta: test que pasa, traza, diff de desensamblado, observacion en runtime.
5. Registrar con `equivalence_record` y luego consultar con `equivalence_list`.

## Diferencias esperables N64 -> PS2
- `daddu`/`daddiu`/`ld`/`sd` en PS2 equivalen en forma a `addu`/`addiu`/`lw`/`sw`.
- PS2 usa little-endian y a menudo VU0/MMI; el motor no normaliza instrucciones MMI.
- Convencion de llamada distinta: no asumir que `$a0-$a3` significan lo mismo sin verificar.
- El stack frame puede cambiar por alineacion a 16 bytes en PS2.

## Limites
- El motor compara forma, no efectos secundarios ni semantica de memoria.
- Funciones con inline assembly o macros no se reconstruyen de forma fiable.
- Sin ROM/ELF real, los tests solo cubren fixtures sinteticos.
