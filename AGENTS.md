# Retrace MCP — acuerdo de trabajo

Repositorio compartido por varios agentes de IA y un dueño humano. Leer antes de editar.

## Reglas no negociables

1. `master` es la rama de integración. Antes de trabajar y antes de subir:
   `git pull --rebase origin master`.
2. Nunca `push --force`, nunca reescribir historia, nunca `reset --hard` en ramas compartidas.
3. Nunca commitear secretos, tokens, ROMs, BIOS, ISOs ni binarios de juegos.
4. Commits pequeños y coherentes. No reformatear archivos que no estás cambiando.
5. Nada de herramientas, parsers ni resultados falsos. Si falta un binario o un dato,
   se devuelve un error explícito (`dependency_missing`, `UNSUPPORTED`), no una simulación.
6. Una sola implementación por capacidad. Antes de escribir código, reclamá la tarea en
   `coordination/STATUS.md` y comprobá que nadie la está haciendo.
7. El repositorio debe quedar en verde antes de subir: `npm run typecheck && npm test`
   y `python -m pytest tests -q` en la parte Python.
8. No borrar ni sobrescribir el módulo de otro agente para "simplificar" el propio.

## Coordinación

- Protocolo completo: `docs/coordination/PROTOCOL.md`.
- Propiedad de rutas: `docs/coordination/OWNERSHIP.md`.
- Reclamo de tareas: `coordination/STATUS.md`.
- Decisiones de arquitectura: `docs/coordination/DECISIONS.md` (append-only).
- Pedidos entre áreas: `docs/coordination/REQUESTS/`.

Cada agente trabaja en su propia copia del repositorio y en su propia rama `work/<area>`;
integra por rebase sobre `master`. Nunca dos agentes escriben la misma carpeta al mismo tiempo.

## Estado actual del árbol

Hay dos implementaciones convivientes, producto de trabajo paralelo:

| Ruta | Lenguaje | Contenido |
| --- | --- | --- |
| `src/*.ts`, `src/parsers`, `src/mips`, `src/memory`, `src/graphics`, `src/audio`, `src/repo`, `src/knowledge`, `src/config`, `src/reports`, `src/adapters` | TypeScript | Servidor MCP y motores de análisis |
| `src/retrace_mcp/**` | Python | Servidor MCP alternativo + tools |
| `src/python/retrace_analysis/**` | Python | Sidecar de análisis (capstone/pyelftools) |

**Decisión pendiente del dueño:** qué stack queda como único servidor. Hasta que se
decida, nadie elimina el árbol del otro; se agrega funcionalidad nueva solo en el árbol
que ya tiene la tarea reclamada en `coordination/STATUS.md`.

## Entorno

- Node >= 20, TypeScript strict, ESM. SDK `@modelcontextprotocol/sdk`.
- Python >= 3.10. `mcp`, `capstone`, `pyelftools`.
- Los analizadores externos son opcionales: su disponibilidad se informa, nunca se asume.
