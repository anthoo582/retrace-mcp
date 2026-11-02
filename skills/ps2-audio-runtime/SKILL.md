# ps2-audio-runtime
purpose: Port N64 audio banks, VADPCM and sequence/runtime behavior to PS2 IOP/SPU2 with measurable latency and no invented codebooks.

## Flujo

1. Identificar AIFC/VADPCM, bancos, sample rate, loops, envelopes, pitch y secuencias.
2. Validar codebook y headers; si faltan, devolver `UNSUPPORTED`.
3. Separar samples, scheduler, mixer, streaming y eventos musicales.
4. Asignar IOP/IRX, SPU2, DMA y buffers con tamaño/alineación documentados.
5. Comparar PCM y eventos con tolerancias explícitas; medir underrun, queue depth y latencia.

Copiar samples no prueba equivalencia. Reverb, pan, orden de eventos y timing deben medirse.
