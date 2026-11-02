# Auditoría técnica inicial

Esta auditoría pública resume decisiones técnicas sin incluir rutas locales,
identificadores de sesión, hashes de ROM, snapshots privados ni credenciales.

## Conclusiones

- Retrace MCP usa TypeScript como servidor de referencia y Python como sidecar opcional.
- Las herramientas externas se detectan en runtime y nunca se simulan.
- ROMs, BIOS, ISOs y assets de juegos no forman parte del repositorio.
- Las operaciones de escritura requieren política de escritura y confirmación explícita.
- El pipeline recomendado es intake autorizado → análisis ROM/ELF → segmentación →
  reconstrucción asistida → runtime PS2 → build → validación en emulador/hardware.

## Estado

El entorno de ejecución y las dependencias externas son variables por máquina. La tool
`retrace_probe` debe ser la fuente de verdad para Node, Python, Capstone, binutils,
Ghidra, PS2DEV, PCSX2 y demás adaptadores.

## Seguridad

Los binarios se tratan como datos no confiables. El MCP no descarga ni distribuye material
protegido y devuelve `dependency_missing`, `UNSUPPORTED` o `license_review_required`
cuando no puede verificar una etapa.
