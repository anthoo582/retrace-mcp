# audio-format-analysis
purpose: Guide for identifying and decoding N64 VADPCM and PS2 VAG audio without inventing headers or codebooks.

## Cuando usar
- Un asset suena mal, cambia de pitch o dura distinto tras el port.
- Hay que decidir si un archivo es VAG, AIFC/VADPCM, WAV o AIFF.
- Se necesita PCM para comparar dos versiones.

## Herramientas reales
- `audio_inspect`: detecta contenedor, sample rate, canales y duracion.
- `audio_decode_vag_block`: decodifica un bloque SPU2 de 16 bytes a 28 muestras.
- `audio_decode_file`: decodifica VAG/VAGi o AIFC VADPCM a WAV PCM16.

## PS2 VAG
- Cabecera `VAGp`/`VAGi`, data offset 0x30, frames de 16 bytes.
- Byte de control: bits 0-3 shift, bits 4-7 filtro (5 filtros documentados).
- Cada frame entrega 28 muestras; no aplicar loop ni reverb.

## N64 VADPCM
- El codebook NO es fijo: viaja en el chunk `APPL`/`stoc`/`VADPCMCODES` del AIFC.
- Formato: version u16, order u16, npredictors u16, luego `order * npredictors * 8` coeficientes int16.
- Cada frame son 9 bytes: control + 8 bytes residual.
- Control: nibble alto = scale, nibble bajo = predictor.
- Residual: nibble alto primero; 16 muestras por frame, decodificadas en dos vectores de 8.
- Si falta el codebook, `audio_decode_file` falla explicitamente. No sustituir una tabla adivinada.

## Diagnostico de port
1. Comparar sample rate: un cambio de 22050 a 32000 altera el pitch.
2. Comparar duracion: frames truncados o loop no aplicado.
3. Comparar canales: mono vs stereo cambia la interpretacion del buffer.
4. Verificar endianness del asset, no del CPU.

## Limites
- No se decodifican loops, envelopes ni bancos de instrumentos N64.
- AIFC con codebooks de orden distinto al soportado se rechaza, no se aproxima.
