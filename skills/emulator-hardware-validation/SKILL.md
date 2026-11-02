# emulator-hardware-validation
purpose: Validate PS2 ports through reproducible PCSX2 runs, traces, framebuffer/audio goldens and optional authorized hardware deployment.

## Orden

1. Verificar hash del ELF/IRX, versión de PCSX2, configuración y BIOS ya aportada por el usuario.
2. Ejecutar smoke test con timeout, logs y shutdown controlado.
3. Reproducir inputs; capturar framebuffer, PCM, memoria y trace con timestamp.
4. Comparar contra golden y reportar la primera divergencia, no sólo un score.
5. Repetir en hardware mediante ps2client sólo después de un gate humano.

PINE, memoria de escritura, gsexec, poweroff y despliegue físico requieren allowlist y confirmación.
PCSX2 no sustituye pruebas de latencia, periféricos, stalls o audio en hardware real.
