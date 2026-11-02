# ghidra-headless-analysis
purpose: Run reproducible Ghidra Headless analysis for authorized N64 ROMs and PS2 ELF/IRX files, exporting evidence without treating pseudocode as truth.

## Flujo

1. Probar `analyzeHeadless`, versión de Ghidra, JDK y scripts disponibles.
2. Crear un proyecto separado por hash y conservar logs completos.
3. Configurar processor, endian, image base, language/compiler spec y memory blocks explícitamente.
4. Exportar funciones, símbolos, referencias, CFG y desensamblado con formatos estables.
5. Etiquetar pseudocódigo como candidato; confirmar sólo con tests, traces o equivalence records.

No sobrescribir proyectos existentes sin confirmación. No enviar ROMs a servicios remotos.
Si falta un loader o processor RSP/R5900, devolver `dependency_missing` o `UNSUPPORTED`.
