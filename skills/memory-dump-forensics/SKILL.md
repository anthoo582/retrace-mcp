# memory-dump-forensics
purpose: Guide for reading N64 and PS2 memory dumps safely, mapping addresses and distinguishing code from data.

## Cuando usar
- Hay un crash log o un dump de RAM y se necesita ubicar el fallo.
- Se quiere saber que funcion o textura vive en una direccion.
- Se comparan dos dumps del mismo juego en momentos distintos.

## Herramientas reales
- `memory_map_n64`: segmentos KUSEG/KSEG0/KSEG1 y rangos conocidos.
- `memory_read`: lectura acotada por direccion y longitud.
- `memory_search`: busqueda de bytes o strings con limite.
- `memory_diff`: diferencias entre dos buffers.
- `crash_analyze`: interpreta un registro de excepcion.

## N64
- KSEG0 `0x80000000-0x9FFFFFFF` y KSEG1 `0xA0000000-0xBFFFFFFF` mapean la misma RAM fisica.
- El entry point de la ROM suele estar en `0x80000400`; no confundir con offset de archivo.
- Un dump de emulador puede incluir RDRAM con byte order distinto: normalizar antes de desensamblar.

## PS2
- EE RAM arranca en `0x00100000` para ejecutables normales.
- VU0/VU1 tienen memoria propia; no leerla como si fuera RAM de la EE.
- GS VRAM es swizzled: deswizzlear antes de interpretar texturas.

## Procedimiento
1. Fijar la direccion virtual, no el offset del archivo.
2. Verificar el rango antes de leer: una direccion fuera del mapa es un error, no un cero.
3. Desensamblar solo si la region es ejecutable; si no, tratarla como datos.
4. Cruzar con simbolos del ELF o del symbol map.
5. Registrar el hallazgo en el Knowledge Graph con la evidencia.

## Limites
- No se inventan valores para direcciones no mapeadas.
- Un dump parcial no permite afirmar que una region no existe.
- La busqueda esta acotada por `RETRACE_MAX_FILE_BYTES`.
