# license-provenance
purpose: Track licenses, source provenance, generated artifacts and distribution restrictions across N64/PS2 porting tools and project inputs.

## Registro por artefacto

Guardar nombre, URL, commit/version, licencia, dependencia, hash, comando, autoría y permiso
de uso. Generar SBOM/NOTICE por ejecución y separar código del proyecto, SDK, runtime, tool,
ROM, BIOS, ISO y assets.

## Bloqueos

- `license_review_required` si no se conoce la licencia o sus obligaciones.
- No descargar ni redistribuir ROMs, BIOS, ISOs, assets comerciales, Psy-Q o materiales propietarios.
- No copiar código GPL/AGPL a un módulo MIT sin revisar compatibilidad.
- No afirmar que el permiso para analizar concede permiso para distribuir un port.
