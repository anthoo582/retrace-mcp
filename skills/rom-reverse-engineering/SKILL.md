# rom-reverse-engineering
purpose: Instructions for identifying, validating, normalizing, and analyzing Nintendo 64 ROM files.

## Ámbito de aplicación
Extracción de metadatos, detección de orden de bytes, verificación de checksums y segmentación de ROMs de Nintendo 64.

## Formatos y orden de bytes
1. **.z64 (Big-Endian)**:
   - Primeros 4 bytes: `0x80 0x37 0x12 0x40`.
   - Formato nativo de la consola N64. Todo análisis y desensamblado debe realizarse sobre este formato.
2. **.v64 (Byteswapped / Doctor V64)**:
   - Primeros 4 bytes: `0x37 0x80 0x40 0x12`.
   - Cada par de 16 bits tiene sus bytes invertidos (`B0 B1 B2 B3` -> `B1 B0 B3 B2`).
3. **.n64 (Little-Endian / CD64)**:
   - Primeros 4 bytes: `0x40 0x12 0x37 0x80`.
   - Cada palabra de 32 bits está invertida (`B0 B1 B2 B3` -> `B3 B2 B1 B0`).

## Estructura de la cabecera (primeros 64 bytes)
- `0x00 - 0x03`: Magic de orden de bytes.
- `0x04 - 0x07`: Clock rate y flags.
- `0x08 - 0x0B`: Dirección de punto de entrada (Entry Point, ej. `0x80000400`).
- `0x0C - 0x0F`: Release version.
- `0x10 - 0x17`: Checksum CRC1 y CRC2 (calculados por el CIC chip, típicamente CIC-NUS-6102).
- `0x20 - 0x33`: Nombre interno del juego (20 caracteres ASCII, rellenado con espacios).
- `0x3B`: Country code (ej. `0x45` = USA, `0x4A` = Japón, `0x50` = Europa).
- `0x3C - 0x3F`: Cartridge ID y ROM version.

## Procedimiento
1. Utilizar `rom_identify_format` para detectar el formato de orden de bytes.
2. Normalizar la copia de trabajo a Big-Endian (.z64) usando `normalizeToBigEndian`.
3. Extraer el entry point y comprobar si coincide con el rango KSEG0 (`0x80000000 - 0x807FFFFF`).
4. Utilizar `rom_find_code_regions` para localizar funciones ejecutables sin necesidad de símbolos previos.
