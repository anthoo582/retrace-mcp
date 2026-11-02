# variable-recovery-and-abi
purpose: Recover MIPS variables, candidate structs, types and ABI mappings from N64/PS2 functions using evidence-ranked dataflow observations.

## Flujo

1. Desensamblar con endian y perfil explícitos: R4300i para N64, R5900 para PS2.
2. Registrar accesos a `$sp`, `$fp/$s8`, `$gp`, argumentos, retornos y registros salvados.
3. Agrupar offsets repetidos y proponer locals, globals y campos de structs.
4. Inferir anchura/tipo sólo desde mnemonics y usos; marcar punteros, floats y enteros ambiguos.
5. Consultar callers, xrefs, símbolos, traces y memoria antes de subir la confianza.
6. Validar alineación, aliasing, padding, endian y diferencias de ABI N64/PS2.
7. Generar un mapa revisable; aplicar renombres o cambios de fuente sólo con confirmación.

## Estados

`candidate`, `possible`, `confirmed_by_trace`, `conflicting`, `needs_human`.

Una inferencia de tipo no es una prueba semántica. MMIO, DMA, overlays y punteros de hardware
se mantienen como objetos opacos hasta contar con documentación o una traza reproducible.
