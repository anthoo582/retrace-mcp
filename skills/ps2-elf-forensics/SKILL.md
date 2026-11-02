# ps2-elf-forensics
purpose: Guide for inspecting PlayStation 2 ELF/IRX binaries, symbols, sections and relocations without assuming the target layout.

## Cuando usar
- Hay que identificar arquitectura, entry point, secciones y simbolos de un ELF de PS2.
- Se necesita saber si un binario es un ejecutable principal, un IRX o una libreria.
- Se busca una funcion por nombre o por direccion antes de desensamblar.

## Herramientas reales
- `elf_inspect`: cabecera, secciones, segmentos, simbolos y relocaciones.
- `elf_symbols`: tabla de simbolos filtrada.
- `elf_find_function`: simbolo por nombre o direccion.
- `mips_disassemble` con `arch: "r5900"` y `endian: "little"`.
- `graph_ingest` con `kind: "elf"` para volcar simbolos y secciones al Knowledge Graph.

## Procedimiento
1. Ejecutar `elf_inspect` y confirmar `machineName`, `endian`, `elfClass` y `entry`.
2. Listar secciones ejecutables y su rango de direcciones.
3. Resolver el simbolo antes de leer bytes: un nombre no prueba comportamiento.
4. Desensamblar solo el rango del simbolo, con la direccion virtual correcta.
5. Registrar hallazgos en el grafo con `source: "elf"` y el SHA-256 del archivo.

## Limites
- Un ELF sin simbolos no se "adivina": usar heuristicas de prologo solo como candidatos.
- `ELF` de PS2 suele ser little-endian; no asumir big-endian por ser MIPS.
- Las relocaciones pueden apuntar a simbolos no definidos en el mismo archivo.

## Errores tipicos
- Desensamblar un IRX con la direccion base equivocada: los `jal` no resuelven.
- Confundir `p_paddr` con `p_vaddr` al leer segmentos cargados.
- Leer `.bss` como si tuviera contenido en disco (solo ocupa memoria).
