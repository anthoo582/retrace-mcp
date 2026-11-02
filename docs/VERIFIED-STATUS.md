# Estado verificable

Este documento es el punto de referencia para afirmar qué está comprobado y qué
no. Fue actualizado el **2026-11-02** en el entorno local del repositorio.

## Evidencia reproducible

| Comando | Resultado observado |
| --- | --- |
| `npm run typecheck` | Correcto |
| `npm test` | 78 tests Vitest en 21 archivos |
| `python -m pytest tests -q` | 40 tests aprobados |
| `npm run probe` | 4/33 adaptadores disponibles |
| Registro MCP TypeScript | 76 tools |
| `npm run verify:docs` | Catálogo generado coincide con el registro |

Para repetir la comprobación:

```powershell
npm ci
npm run typecheck
npm test
python -m pytest tests -q
npm run build
npm run probe
```

El número de 76 tools se obtiene del registro efectivo de `src/index.ts`, no de
la suma de capacidades descritas en documentos. El número de 40 tests Python
incluye casos parametrizados de pytest.

## Entorno auditado

Disponibles: Python/Capstone, Git, Ninja y `capstone` de Python. No disponibles:
binutils GNU, radare2, Ghidra, GDB, PCSX2, toolchain PS2, `splat`, N64Recomp,
`m2c`, `asm-differ`, `mkisofs`, `genisoimage` y otros adaptadores externos.

La ausencia de una dependencia no se oculta: las tools afectadas devuelven
`dependency_missing` y no generan resultados falsos.

`project_autopilot` y `project_state` conservan un manifiesto
`retrace.run-manifest.v1` con hashes SHA-256 de entradas, runtime, versiones de
adaptadores, configuración, comandos, artefactos, evidencia y limitaciones.

## Qué no demuestra esta verificación

- No demuestra que el proyecto convierta automáticamente un juego N64 a PS2.
- No demuestra equivalencia semántica, rendimiento, compatibilidad de hardware ni
  funcionamiento de un juego real.
- No sustituye pruebas con ROMs y ELFs autorizados, toolchains fijados, emulador y
  hardware real.
- Los fixtures del repositorio son sintéticos y no contienen datos de juegos.

La descripción honesta del proyecto es: **asistente MCP verificable para analizar
y preparar ports MIPS/N64/PS2**.
