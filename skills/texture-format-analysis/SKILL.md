# texture-format-analysis
purpose: Guide for analyzing, decoding, and converting texture graphics between Nintendo 64 RDP/TMEM formats and PlayStation 2 GS formats.

## Ámbito de aplicación
Investigación de corrupción visual, canales de color invertidos, artefactos de transparencia y problemas de alineación en conversiones de texturas de N64 a PS2.

## Formatos de Nintendo 64 (RDP)
- **RGBA16 (5/5/5/1)**: 5 bits Red, 5 bits Green, 5 bits Blue, 1 bit Alpha. Formato más común para sprites y texturas con color sólido y máscara binaria.
- **RGBA32 (8/8/8/8)**: 32 bits por texel (verdadero color + alpha suave). Ocupa mucho espacio en TMEM (4KB límite).
- **CI8 / CI4 (Color Indexed)**: 8 bits (256 colores) o 4 bits (16 colores) por texel, indexando una paleta TLUT (Color Lookup Table) almacenada en TMEM o RAM.
- **IA16 / IA8 / IA4 (Intensity + Alpha)**: Escala de grises con canal de transparencia.
- **I8 / I4 (Intensity)**: Escala de grises pura sin canal alpha.

## Formatos de PlayStation 2 (Graphics Synthesizer)
- **PSMCT32**: 32-bit RGBA (8:8:8:8), canal alfa en bits 24-31 (0x80 = 100% opaco en GS estándar).
- **PSMCT16**: 16-bit RGB (5:5:5:1), similar a RGBA16 pero con orden de bits adaptado al GS.
- **PSMT8 / PSMT4**: Formatos indexados por CLUT (paleta de 256 o 16 colores).

## Problemas comunes en ports N64 -> PS2
1. **Inversión de Endianness**: Los datos de textura de N64 en Big-Endian leídos directamente por la CPU R5900 o transferidos a GS sin swap provocan texels con colores aleatorios o ruido.
2. **Interpretación de Alpha**: En N64 RGBA16, el bit de alpha es el bit menos significativo (`value & 1`). En PS2 GS PSMCT16, el bit alfa es el más significativo (`value >> 15`).
3. **Swizzling de VRAM en PS2**: Las texturas subidas a la memoria de video del GS se reorganizan en bloques según páginas y columnas ("swizzle"). Si se lee linealmente un volcado de VRAM sin des-swizzling, la imagen aparece distorsionada en bloques rectangulares.
4. **Paletas desalineadas (CLUT)**: En PS2, el orden de las entradas de la CLUT en PSMT8 tiene un patrón de permutación (CSM1) donde los índices 8-15 y 16-23 se intercambian.

