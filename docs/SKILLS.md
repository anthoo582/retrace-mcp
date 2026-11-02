# Skills incluidas

12 skills en `skills/`, leibles con `retrace_skill_list` y `retrace_skill_read`.

| Skill | Uso |
| --- | --- |
| `rom-reverse-engineering` | Cabecera, formato, checksum, regiones de codigo N64 |
| `ps2-elf-forensics` | ELF/IRX de PS2: secciones, simbolos, relocaciones |
| `mips-r4300i-engineering` | Convenciones y patrones del R4300i (N64) |
| `mips-r5900-engineering` | R5900/EE, MMI, diferencias con N64 |
| `cross-platform-porting` | Comparacion N64/PS2 y evidencia de equivalencia |
| `texture-format-analysis` | RDP vs GS, swizzle, CLUT, alpha |
| `audio-format-analysis` | VAG, VADPCM, codebooks, pitch y duracion |
| `memory-dump-forensics` | Mapas de memoria, dumps, busqueda y diff |
| `crash-forensics` | Registros de excepcion y corrupcion |
| `decomp-workflow` | Desensamblado vs reconstruccion vs decomp verificable |
| `build-validation` | Detectar y ejecutar builds de forma segura |
| `n64-to-ps2-porting` | Flujo completo de portabilidad, traducción binaria segura y validación |

## Procedencia
- Escritas para Retrace: `ps2-elf-forensics`, `cross-platform-porting`,
  `audio-format-analysis`, `memory-dump-forensics`, `decomp-workflow`, `build-validation`.
- Las cinco restantes ya existian en el repositorio y se mantienen.

## Regla
Una skill describe procedimiento y limites; no sustituye tests ni evidencia. Las tecnicas
externas se citan por fuente y licencia en `docs/INTEGRATIONS.md`; no se copia codigo GPL
a este repositorio MIT.
