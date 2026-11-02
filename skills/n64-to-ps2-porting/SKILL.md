# n64-to-ps2-porting
purpose: Orchestrate an evidence-driven Nintendo 64 to PlayStation 2 port with safe binary translation, ABI review, runtime replacement and reproducible validation.

## Objetivo

Convertir un proyecto de N64 a PS2 por etapas verificables. El MCP puede traducir la
representación endian de palabras MIPS comunes y producir planes, pero no puede convertir
automáticamente periféricos, llamadas de runtime, gráficos, audio o lógica de juego.

## Flujo obligatorio

1. Ejecutar `retrace_probe` y guardar las versiones/adaptadores disponibles.
2. Ejecutar `port_project_plan` con `sourcePlatform=n64` y `targetPlatform=ps2`.
3. Inventariar ROM, símbolos, secciones, texturas, audio y hashes; nunca subir ROMs, BIOS o ISOs.
4. Usar `rom_inspect`, `elf_inspect`, `mips_disassemble` y `compare_rank` para crear candidatos.
5. Usar `binary_translate` solo para instrucciones MIPS comunes. Si rechaza una palabra, revisar
   manualmente CP0/CP1/CP2, MMI, VU, direcciones absolutas y accesos a periféricos.
6. Adaptar ABI, mapa de memoria, DMA, audio, RDP/GS, scheduler y llamadas de sistema en código fuente.
7. Validar con `port_validate_translation`, builds limpios, trazas de emulador y pruebas de regresión.
8. Registrar equivalencias confirmadas con `equivalence_record`; una similitud nunca es confirmación.

## Traducción binaria

`binary_translate` cambia únicamente la representación endian de palabras de 32 bits y conserva
el valor de la instrucción. Rechaza instrucciones de coprocesador o específicas de consola por
defecto. `allowUnsupported=true` genera solamente un artefacto de revisión; no debe ejecutarse.

## Evidencia y límites

- Round-trip exacto prueba preservación de encoding, no equivalencia semántica.
- Branches, jumps, relocaciones, símbolos, ABI y llamadas externas necesitan revisión.
- Los archivos originales son inmutables; las escrituras requieren `RETRACE_ALLOW_WRITE=1` y
  `apply=true` y deben ir a un artefacto separado.
- No inventar resultados si falta Capstone, binutils, toolchain PS2 o emulador: reportar
  `dependency_missing` o `UNSUPPORTED`.
