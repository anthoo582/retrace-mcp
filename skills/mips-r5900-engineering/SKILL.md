# mips-r5900-engineering
purpose: Specialized engineering guide for the Sony Emotion Engine core (R5900 MIPS III + 128-bit Multimedia Extensions) in the PlayStation 2.

## Ámbito de aplicación
Ingeniería inversa, desensamblado, depuración y porting de código a la PlayStation 2.

## Conocimientos técnicos
- **Arquitectura**: CPU R5900 de 64 bits con registros de propósito general extendidos a 128 bits (GPRs `$0` a `$31`), Little-Endian por defecto.
- **Diferencia crítica con N64 R4300i**:
  - R4300i es Big-Endian; R5900 es Little-Endian.
  - R5900 incluye extensiones MMI (128-bit SIMD: `paddw`, `psubw`, `pmulth`, etc.).
  - R5900 tiene dos ALUs independientes y una FPU de precisión simple (COP1).
  - Puntero de pila `$sp` debe mantenerse alineado a 16 bytes (128 bits) para operaciones quadword (`sq`, `lq`).
- **Espacio de memoria de PS2**:
  - Main RAM (EE): `0x00000000 - 0x01FFFFFF` (32MB).
  - Scratchpad RAM (SPR): `0x70000000 - 0x70003FFF` (16KB de memoria ultrarrápida sin cache).
  - GS Privileged Registers: `0x12000000 - 0x12001FFF`.
  - DMA Controller (DMAC): `0x10008000 - 0x1000E000`.

## Convención de llamadas (EE ABI)
- Argumentos: `$a0-$a3` para los primeros 4 enteros/punteros.
- Registros `$t0-$t3` también pueden usarse como argumentos extendidos `$a4-$a7` en ciertas llamadas del PS2SDK.
- Retorno: `$v0-$v1`.
- Preservados: `$s0-$s7`, `$gp`, `$sp`, `$fp`.

## Instrucciones quadword de R5900
- `sq $reg, offset($base)`: Guarda 128 bits completos de `$reg`. Requiere offset alineado a 16 bytes.
- `lq $reg, offset($base)`: Carga 128 bits. Si no está alineado a 16 bytes, genera excepción Address Error.

## Errores habituales
- Intentar usar instrucciones R5900 en Big-Endian o asumir compatibilidad binaria con N64.
- Desalineación de pila menor a 16 bytes al llamar a funciones del PS2SDK o compilar con GCC MIPS64 EE.

