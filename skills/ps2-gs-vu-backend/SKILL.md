# ps2-gs-vu-backend
purpose: Design and validate a PlayStation 2 GS/GIF/VIF/VU1 backend for assets and rendering originally driven by N64 RDP/RSP.

## Contrato

Cada módulo debe declarar formato de vértices, PSM, CLUT, tamaño de página, DMA chain,
VIF packets, destino VU, estado GS, sincronización y presupuesto de VRAM/EE RAM.

## Flujo

1. Convertir display-list IR a una representación independiente de hardware.
2. Elegir EE, VU1, GIF y GS para cada etapa; justificar cada fallback.
3. Validar alineación DMA/VIF, tags, fences, caches y ownership de buffers.
4. Generar paquetes GS sólo desde estado validado; no aceptar registros arbitrarios.
5. Comparar framebuffer con golden usando tolerancia declarada por escena.

## Gates

- `UNSUPPORTED` para combiner/blender, coverage, dithering o framebuffer effects sin mapping.
- No llamar `gsexec`, escribir memoria o arrancar VU sin una sesión autorizada.
- Un pixel diff bajo no demuestra igualdad de timing, memoria o rendimiento.
