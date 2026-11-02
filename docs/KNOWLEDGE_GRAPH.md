# Knowledge Graph

## Almacenamiento
JSON por workspace en `$RETRACE_DATA_DIR/knowledge/<hash>.json`. Version 1.
Nodos en mapa `id -> { type, label, props, updatedAt }`; aristas en lista
`{ from, to, type, props, updatedAt }`.

## Tipos de nodo
`file`, `function`, `symbol`, `structure`, `address`, `texture`, `audio`,
`memory_region`, `build`, `crash`, `investigation`, `note`.

## Ingestion
`graph_ingest` con:
- `kind: "elf"`: archivo, secciones, funciones/simbolos, relocaciones. Relaciones
  `contains`, `defines`, `in_section`, `references`.
- `kind: "rom"`: cabecera N64, regiones de codigo y strings ASCII. Relaciones `contains`.
- `kind: "symbols"`: tabla de texto (nm, map, assignments). Relaciones `defines`.

Cada ingestion registra SHA-256 del archivo y `source`, para que el nodo sea atribuible.

## Consulta
`graph_query_neighbors` (profundidad 1-4) y `graph_node_upsert`/`graph_edge_upsert` para
anotaciones manuales. Los resultados incluyen `limitations`: un nombre o un string no
prueban comportamiento.

## Regla
El grafo guarda observaciones y relaciones; no sustituye evidencia. Una equivalencia
`confirmed` vive en el registro de equivalencias, no solo en el grafo.
