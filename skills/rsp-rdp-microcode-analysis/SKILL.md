# rsp-rdp-microcode-analysis
purpose: Analyze Nintendo 64 RSP/RDP microcode, display lists, DMEM/IMEM and TMEM while separating known formats from custom or unsupported microcode.

## Flujo

1. Preservar hashes, offsets, endian y límites de cada tarea RSP/RDP.
2. Distinguir código RSP, datos DMEM/IMEM, display lists, vértices, matrices y texturas.
3. Decodificar sólo opcodes documentados o cubiertos por un decoder verificable.
4. Construir una IR de display list con estado de textura, combiner, blender, viewport y depth.
5. Marcar microcode custom, MMIO y efectos de coverage/FB como `UNSUPPORTED` o `needs_human`.

## Evidencia mínima

- Hash y rango de entrada.
- Decoder y versión utilizados.
- Lista de opcodes desconocidos.
- Dependencias entre tareas DMA y buffers.
- Golden de display-list/imagen sólo si existe una referencia autorizada.

## Límite de port

RSP/RDP no tiene un reemplazo 1:1 en VU1/GS. La salida es una especificación para backend,
no código PS2 automáticamente equivalente. Nunca inventar microcode ni convertir una imagen
correcta en prueba de equivalencia temporal.
