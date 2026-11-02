# build-validation
purpose: Guide for inspecting and running builds without turning the MCP server into an arbitrary command executor.

## Cuando usar
- Hay que saber que sistema de build usa el repositorio antes de tocarlo.
- Se necesita compilar o correr tests como parte de una validacion.
- Un cambio debe verificarse antes de declararlo terminado.

## Herramientas reales
- `build_analyze`: detecta manifiestos, scripts, targets y toolchain sin ejecutar nada.
- `build_run`: ejecuta un comando de una allowlist, con `shell:false`, cwd dentro del workspace, timeout y argumentos restringidos.

## Procedimiento
1. `build_analyze` primero: nunca asumir npm, make o cmake.
2. Confirmar que existen los binarios con `retrace_probe` (adapters).
3. Elegir el comando exacto de la allowlist y pasar argumentos simples (sin `;`, `&&`, `|`, comillas).
4. Activar `RETRACE_ALLOW_WRITE=1` y llamar `build_run` con `confirm: true`.
5. Leer `code`, `stdout`, `stderr`, `timedOut` y `durationMs`.
6. Si falla, corregir y volver a correr; no declarar exito sin un codigo 0.

## Reglas de seguridad
- `build_run` no acepta shell, redirecciones, pipes ni sustitucion de comandos.
- El cwd debe estar dentro de los workspace roots configurados.
- Timeout maximo: 10 minutos.
- Nivel 4 (borrar, sobrescribir ROMs/ELFs, reescribir historia) no se expone.

## Limites
- En Windows, npm/npx pasan por `cmd.exe` con argumentos validados; el resto usa spawn directo.
- No se instalan dependencias automaticamente.
- Un build verde no prueba equivalencia funcional con el original.
