# mips-r4300i-engineering
purpose: Specialized engineering guide for the NEC VR4300 (MIPS III, 64-bit architecture in 32-bit mode) used in the Nintendo 64.

## Ámbito de aplicación
Análisis de ejecutables, desensamblado de código, reconstrucción de funciones y depuración del procesador principal de la Nintendo 64.

## Conocimientos técnicos
- **Arquitectura de registros**: 32 registros de propósito general (GPRs) de 64 bits ($0 a $31), HI/LO para multiplicación/división, PC, y coprocesador 0 (CP0) para MMU/excepciones y CP1 (FPU 32 registros FPR).
- **Endianness**: Big-Endian estricto. La palabra `0x80371240` en memoria tiene el byte `0x80` en la dirección menor.
- **Segmentos de memoria virtual**:
  - `KUSEG`: `0x00000000 - 0x7FFFFFFF` (mapeado por TLB, modo usuario).
  - `KSEG0`: `0x80000000 - 0x9FFFFFFF` (caching habilitado, no traducido por TLB; aquí corre casi todo el código del juego en RAM).
  - `KSEG1`: `0xA0000000 - 0xBFFFFFFF` (sin cache, no traducido; para I/O y ROM cartuchos).
  - `KSSEG/KSEG3`: `0xC0000000 - 0xFFFFFFFF`.
- **Branch Delay Slots**: Cada salto (`j`, `jal`, `jr`, `beq`, `bne`, etc.) ejecuta la instrucción inmediatamente siguiente antes de realizar el salto. NUNCA reordenar o eliminar la instrucción en el delay slot sin verificar dependencias.

## Convenciones de llamadas (ABI N64 / O32 / N32)
- `$a0-$a3` ($4-$7): Argumentos 1 a 4.
- `$v0-$v1` ($2-$3): Valores de retorno.
- `$t0-$t9` ($8-$15, $24-$25): Registros temporales (caller-saved).
- `$s0-$s7` ($16-$23): Registros preservados (callee-saved).
- `$gp` ($28): Puntero global.
- `$sp` ($29): Puntero de pila (alineado a 8 bytes).
- `$fp/$s8` ($30): Puntero de frame (opcional).
- `$ra` ($31): Dirección de retorno.

## Procedimiento de análisis
1. Localizar el prólogo de la función: buscar `addiu $sp, $sp, -frame_size` o `daddiu $sp, $sp, -frame_size`.
2. Identificar el guardado de `$ra`: `sw $ra, offset($sp)` o `sd $ra, offset($sp)`.
3. Detectar llamadas a subrutinas: `jal target` o `jalr $reg`. Notar el argumento en el delay slot.
4. Rastrear el epílogo: restauración de `$s0-$s7` y `$ra`, y `jr $ra` seguido de `addiu $sp, $sp, frame_size` en el delay slot.

## Errores habituales
- Olvidar que la instrucción en el delay slot se ejecuta SIEMPRE, incluso cuando la rama condicional no se toma (salvo en instrucciones `branch likely` como `beql`, donde se anula si no se toma).
- Confundir direcciones físicas de RDRAM (`0x00000000 - 0x007FFFFF`) con direcciones virtuales en KSEG0 (`0x80000000 - 0x807FFFFF`).

## Criterios de validación
- Toda función reconstruida debe preservar la alineación de pila.
- Ninguna instrucción de delay slot debe ser movida fuera del bloque de salto.

