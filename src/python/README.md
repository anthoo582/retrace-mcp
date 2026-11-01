# Python sidecar

Motor de análisis de `retrace-mcp`. **No habla MCP**: recibe JSON por línea y
devuelve JSON por línea. El contrato está en `contracts/sidecar.protocol.md`.

## Requisitos

- Python 3.10+
- `capstone` (desensamblado MIPS)
- `pyelftools` (ELF)

```
python -m pip install capstone pyelftools
```

## Arranque

```
cd src/python
python -m retrace_analysis
```

Al arrancar emite:

```json
{"event":"ready","protocol":1,"sidecar":"0.1.0"}
```

## Prueba rápida

```
echo '{"id":1,"method":"system.health","params":{}}' | python -m retrace_analysis
```

## Tests

```
python -m pip install pytest
python -m pytest tests/python -q
```

Los fixtures son sintéticos: se generan en memoria, no hay ROMs ni binarios de
juegos en el repositorio.
