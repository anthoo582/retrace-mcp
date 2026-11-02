# n64-asset-pipeline
purpose: Inventory, identify and convert authorized Nintendo 64 textures, geometry, animations, audio and level assets into reviewable PS2-ready manifests.

## Flujo

1. Leer sólo archivos locales autorizados y registrar SHA-256, offsets, región y formato.
2. Preferir manifests de splat/Z64Utils o metadata del proyecto; no adivinar estructuras.
3. Clasificar texturas RGBA/CI/IA/I, TLUT, display lists, vértices, bancos y secuencias.
4. Emitir derivados separados del original, con formato PS2, dimensiones, PSM y pérdida.
5. Hacer round-trip y conservar golden files para cada conversión conocida.

## Estados

`identified`, `converted`, `round_trip_verified`, `needs_human`, `unsupported`.

Un asset desconocido nunca se rellena con datos sintéticos. No se distribuyen ROMs, BIOS,
ISOs o assets comerciales; el MCP trabaja sobre rutas locales y manifests.
