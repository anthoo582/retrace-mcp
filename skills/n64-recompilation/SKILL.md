# n64-recompilation
purpose: Orchestrate splat, N64Recomp, m2c and asm-differ as a reproducible N64 recompilation/decompilation lane before PS2 adaptation.

## Dos carriles

- Baseline: splat + N64Recomp para C/C++ generado y runtime documentado.
- Control: splat + m2c + compiler fijado + asm-differ por función.

No mezclar un baseline funcional con una reconstrucción exacta. Cada ejecución registra config,
hashes, versión, stdout/stderr, stubs, relocations, overlays y fallos.

## Gates

- Ningún C generado se etiqueta como fuente original.
- MMIO, microcode, overlays o relocations ambiguas quedan visibles.
- Un assembly match sólo mide forma/binario; no prueba comportamiento en PS2.
- Tool faltante produce `dependency_missing`, nunca una salida simulada.
