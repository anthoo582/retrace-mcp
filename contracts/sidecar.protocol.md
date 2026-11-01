# Contrato TS ↔ Python — `retrace analysis sidecar` v1

El servidor MCP (TypeScript) es el único que habla MCP. El análisis pesado vive en un
proceso Python que **no conoce MCP**. Esta es una interfaz pública: cambia solo por ADR.

## Transporte

- El servidor lanza `python -m retrace_analysis` con `cwd` en la raíz del paquete Python
  (`src/python`) o con `PYTHONPATH` apuntando a ella.
- `stdin`/`stdout`: **un objeto JSON por línea**, UTF-8, sin saltos internos.
- `stderr`: logs del sidecar, una línea JSON por registro. Nunca se mezcla con stdout.
- Al arrancar, el sidecar emite `{"event":"ready","protocol":1,"sidecar":"x.y.z"}`.

## Petición

```json
{"id": 7, "method": "mips.disassemble", "params": {"data_hex": "27bdffe0", "address": 2147483648, "arch": "r4300i", "endian": "big"}}
```

- `id`: entero o string, único por conexión. Se devuelve igual.
- `method`: ver catálogo.
- `params`: objeto. Todos los límites tienen valor por defecto y máximo.

## Respuesta

```json
{"id": 7, "ok": true, "result": {...}, "meta": {"duration_ms": 3, "sidecar": "x.y.z"}}
{"id": 7, "ok": false, "error": {"code": "INVALID_PARAMS", "message": "...", "details": {}}}
```

Códigos de error estables: `INVALID_PARAMS`, `NOT_FOUND`, `UNSUPPORTED`, `TOO_LARGE`,
`DENIED_PATH`, `DEPENDENCY_MISSING`, `PARSE_ERROR`, `INTERNAL`.

Toda respuesta de análisis incluye `evidence` cuando corresponde:
`{"source": "<ruta o 'synthetic'>", "tool": "<capstone|pyelftools|builtin>", "detail": "..."}`
y `confidence` con uno de `confirmed | very_likely | possible | insufficient`.

## Métodos v1

| Método | Params | Resultado |
|---|---|---|
| `system.health` | `{}` | versión, python, presencia de capstone/pyelftools |
| `env.probe` | `{"extra_paths": ["..."]}` | herramientas externas detectadas, versión, ruta, notas |
| `mips.disassemble` | `{data_hex\|data_base64, address, arch, endian, count?, stop_at_return?}` | instrucciones, bytes consumidos |
| `mips.analyze_function` | igual + `max_instructions?` | instrucciones, bloques básicos, llamadas, saltos, accesos a memoria, prólogo, retornos, confianza |
| `elf.inspect` | `{path}` | cabecera, secciones, segmentos, conteos, arquitectura |
| `elf.symbols` | `{path, kind?, pattern?, limit?}` | símbolos filtrados |
| `elf.resolve` | `{path, address}` | símbolo + offset, sección |
| `rom.identify` | `{path}` | formato, orden de bytes, cabecera, acción de normalización sugerida |
| `rom.inspect` | `{path}` | `rom.identify` + entrada, nombre, región, CRC de cabecera |
| `memory.classify_address` | `{arch, address}` | región documentada, rango, notas |
| `memory.resolve` | `{arch?, elf?, map?, address}` | símbolo, región, alineación, veredicto |

## Reglas

- `arch`: `r4300i` (N64, MIPS III, big-endian) o `r5900` (PS2 EE, MIPS III/IV + VU0, little-endian).
  Otras arquitecturas devuelven `UNSUPPORTED`. **Nunca** se asume equivalencia entre ambas.
- `path` debe ser absoluto. El sidecar vuelve a validar: existe, es archivo regular,
  tamaño ≤ `RETRACE_MAX_FILE_BYTES`. Se abre siempre en modo lectura (`rb`).
- Sin red. Sin shell. Sin ejecutar código del binario analizado.
- `address` es la dirección virtual del primer byte; el desensamblado no la inventa.
- Un resultado sin evidencia suficiente se devuelve igual, con `confidence: "insufficient"`
  y `limitations[]`. Nunca se rellena con datos inventados.
