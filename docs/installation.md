# Instalación y conexión

Guía para dejar Retrace MCP funcionando en Windows, Linux o macOS.

## 1. Requisitos

| Componente | Versión | Necesario para |
| --- | --- | --- |
| Node.js | >= 20 | Servidor MCP TypeScript |
| Python | >= 3.10 | Sidecar Capstone / pyelftools |
| `capstone` | >= 5.0 | Desensamblado MIPS |
| `pyelftools` | >= 0.31 | Parsing ELF |

Opcionales, detectados en runtime y nunca simulados: binutils MIPS, radare2,
Ghidra, toolchain PS2, PCSX2, `splat`, `N64Recomp`, `m2c`, `asm-differ`.

## 2. Clonar

```bash
git clone https://github.com/anthoo582/retrace-mcp.git
cd retrace-mcp
```

## 3. Servidor TypeScript

```bash
npm ci
npm run build
npm run probe
```

También puedes instalar el CLI publicado:

```bash
npm install -g @anthoo582/retrace-mcp
retrace-mcp
```

`npm run probe` muestra Node, workspace, límites, política de escritura y
adaptadores disponibles. Para arrancar el servidor desde el checkout:

```bash
node dist/index.js
```

El servidor habla MCP por stdio; no abre un puerto salvo que definas
`RETRACE_HTTP_PORT`.

## 4. Sidecar Python

Windows (PowerShell):

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

Linux / macOS:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Verificación:

```bash
python -m retrace_mcp --transport stdio
```

El proceso queda esperando el handshake MCP. Si `capstone` o `pyelftools` faltan,
el servidor TypeScript responde `dependency_missing` en las tools que los
necesitan.

## 5. Conectar un cliente

Usa una ruta absoluta al `dist/index.js` del clon. En JSON, escribe las rutas de
Windows con `/` o con `\\`.

### OpenCode

Copia el bloque en tu `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "retrace": {
      "type": "local",
      "command": ["node", "C:/ruta/a/retrace-mcp/dist/index.js"],
      "enabled": true,
      "environment": {
        "RETRACE_WORKSPACE": "C:/ruta/a/tu/proyecto",
        "RETRACE_PYTHON": "python"
      }
    }
  }
}
```

### Claude Code

Guarda el archivo como `.mcp.json` en la raíz del proyecto, o usa
`claude mcp add`:

```json
{
  "mcpServers": {
    "retrace": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/ruta/a/retrace-mcp/dist/index.js"],
      "env": {
        "RETRACE_WORKSPACE": "C:/ruta/a/tu/proyecto",
        "RETRACE_PYTHON": "python"
      }
    }
  }
}
```

### Codex

Fusiona el bloque en `~/.codex/config.toml` (no sobrescribas el archivo):

```toml
[mcp_servers.retrace]
command = "node"
args = ["C:/ruta/a/retrace-mcp/dist/index.js"]

[mcp_servers.retrace.env]
RETRACE_WORKSPACE = "C:/ruta/a/tu/proyecto"
RETRACE_PYTHON = "python"
```

Los archivos de [`configs/`](../configs) son plantillas con la misma forma.

## 6. Variables útiles

| Variable | Ejemplo | Efecto |
| --- | --- | --- |
| `RETRACE_WORKSPACE` | `C:/proyectos/mi-juego` | Roots permitidos |
| `RETRACE_DATA_DIR` | `C:/retrace-data` | Grafo y equivalencias |
| `RETRACE_ALLOW_WRITE` | `1` | Habilita tools de escritura |
| `RETRACE_MAX_FILE_BYTES` | `536870912` | Límite de lectura |
| `RETRACE_COMMAND_TIMEOUT_MS` | `60000` | Timeout de procesos externos |
| `RETRACE_PYTHON` | `C:/Python312/python.exe` | Intérprete del sidecar |

La lista completa está en el [README](../README.md#variables-de-entorno).

## 7. Diagnóstico rápido

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `capstone is not installed` | Falta el paquete Python | `pip install capstone` |
| `dependency_missing` | Falta una herramienta externa | Ejecuta `retrace_probe` |
| `PATH_OUTSIDE_WORKSPACE` | La ruta no está bajo un root | Define `RETRACE_WORKSPACE` |
| Una tool de escritura falla | Política de solo lectura | Define `RETRACE_ALLOW_WRITE=1` y pasa `confirm`/`apply` |
| El cliente no ve las tools | `dist/index.js` no existe | Ejecuta `npm run build` |

## 8. Tests

```bash
npm run typecheck
npm test
python -m pytest tests -q
```

Resultado esperado: 74 tests vitest y 40 tests pytest en verde.
