# Decisiones (append-only)

Formato: `## ADR-NNN — título` + contexto + decisión + consecuencias. No se edita lo ya escrito.

## ADR-001 — Un solo servidor MCP, TypeScript, con sidecar Python

Contexto: el camino crítico es parsing binario (MIPS, ELF, ROM) y ejecución controlada
de binutils/toolchains; el transporte MCP y la ergonomía de cliente son mejores en Node.

Decisión: servidor MCP en TypeScript (`@modelcontextprotocol/sdk`) y motores de análisis
en Python (`capstone`, `pyelftools`), comunicados por JSON-RPC de línea sobre stdio.

Consecuencias: dos runtimes que instalar; el contrato del sidecar es interfaz pública y
cambia solo por ADR. Ninguna tool puede existir solo en el sidecar: debe estar expuesta
como tool MCP.

## ADR-002 — Coordinación por ramas `work/*`, `master` solo integración

Contexto: varias IA trabajando en paralelo.

Decisión: cada agente en su clon + su rama; integración por PR/merge rebase; propiedad
de rutas en `OWNERSHIP.md`; cambios ajenos por `REQUESTS/`.

Consecuencias: nunca se pisa trabajo en disco; los conflictos se resuelven en integración.

## ADR-003 — Análisis de solo lectura por defecto

Decisión: toda tool de análisis abre binarios en modo lectura y trabaja sobre copias.
Escritura en el workspace requiere `RETRACE_ALLOW_WRITE=1` y una tool de nivel 3 con
aprobación explícita. ROMs, ELFs y dumps originales nunca se sobrescriben.

Consecuencias: las tools declaran `readOnly` en el catálogo; las de escritura se marcan
y se prueban aparte.

## ADR-004 — Sin datos de juegos en el repositorio

Decisión: el repositorio no contiene ROMs, BIOS, ISOs, assets ni código de ningún juego.
Los fixtures son sintéticos y se generan en `tests/fixtures/generated/` (ignorado por git).

Consecuencias: los tests construyen sus propios binarios mínimos; cualquier ejemplo real
se toma de la máquina del usuario en tiempo de ejecución, nunca se commitea.
