# ps2-dma-timing
purpose: Model N64 DMA/timing dependencies and map them to PS2 EE/IOP/VIF/GIF/SPU2 synchronization points.

## Checklist

- Declarar dueño, lifetime, tamaño, alineación y cache policy de cada buffer.
- Registrar origen/destino, canal DMA, tag, interrupt, fence y punto de consumo.
- Detectar solapamientos, deadlocks, stalls, underruns y carreras.
- Medir VI/vsync, input-to-display, audio quantum, GS/VU fences y frame pacing.
- Guardar trace NDJSON y primera divergencia; no ocultar jitter.

El timing de una escena correcta no prueba equivalencia. Cualquier dependencia sin evidencia
queda en `needs_human`.
