# Integraciones y procedencia

Retrace detecta herramientas externas con `retrace_probe`; no las instala ni asume que
existan. Referencias usadas para diseno, sin copiar codigo incompatible con MIT.

| Proyecto | Licencia | Uso en Retrace |
| --- | --- | --- |
| N64Recomp (Wiseguy) | MIT | Referencia conceptual de recompilacion estatica |
| N64ModernRuntime | GPL-3.0 | Solo referencia; no se enlaza |
| GhidraMCP (LaurieWired) | Apache-2.0 | Patron de exposicion de analisis via MCP |
| ReVa | Apache-2.0 | Patron de tools de reversing |
| radare2 / rizin | LGPL-3.0 | Adaptador opcional, invocado como proceso |
| ps2dev/ps2sdk | licencia ps2dev | Referencia de toolchain PS2 |
| ps2toolchain | BSD-2-Clause | Referencia de build cruzado |
| splat | MIT | Referencia de configuracion de segmentos |
| m2c | GPL-3.0 | Referencia de pseudo-C; no se copia |
| PS2Recomp | GPL-3.0 | Referencia; no se enlaza |
| VADPCM (depp) | documentacion publica | Algoritmo de decodificacion N64 VADPCM |

## Regla de licencias
- El repositorio es MIT.
- Codigo GPL/LGPL no se copia ni se enlaza: se invoca como proceso externo opcional.
- Toda tecnica adaptada se documenta aqui con su fuente.

## Adaptadores
`src/adapters/registry.ts` informa disponibilidad y version. Si falta un binario, la tool
devuelve `dependency_missing`; nunca simula el resultado.
