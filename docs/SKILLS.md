# Skills incluidas

22 skills en `skills/`, leibles con `retrace_skill_list` y `retrace_skill_read`.

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
| `rsp-rdp-microcode-analysis` | Microcódigo RSP/RDP, display lists, DMEM/IMEM y TMEM |
| `ps2-gs-vu-backend` | Diseño y validación de backend GS/GIF/VIF/VU1 |
| `n64-asset-pipeline` | Inventario y conversión verificable de assets N64 |
| `ps2-audio-runtime` | Port de bancos, VADPCM, mixer y runtime SPU2/IOP |
| `ps2-dma-timing` | DMA, buffers, sincronización, stalls y timing |
| `ghidra-headless-analysis` | Análisis reproducible de ROM/ELF con Ghidra Headless |
| `n64-recompilation` | Orquestación de splat, N64Recomp, m2c y asm-differ |
| `emulator-hardware-validation` | Validación PCSX2, goldens, traces y hardware autorizado |
| `license-provenance` | Licencias, SBOM, procedencia y límites de distribución |
| `variable-recovery-and-abi` | Variables, structs, tipos y mapeos ABI N64/PS2 |

El flujo recomendado y sus fuentes primarias están documentados en
[`reports/Portabilidad N64 a PS2.md`](../reports/Portabilidad%20N64%20a%20PS2.md).

## Procedencia
- Escritas para Retrace: `ps2-elf-forensics`, `cross-platform-porting`,
  `audio-format-analysis`, `memory-dump-forensics`, `decomp-workflow`, `build-validation`.
- Las cinco restantes ya existian en el repositorio y se mantienen.

## Regla
Una skill describe procedimiento y limites; no sustituye tests ni evidencia. Las tecnicas
externas se citan por fuente y licencia en `docs/INTEGRATIONS.md`; no se copia codigo GPL
a este repositorio MIT.
