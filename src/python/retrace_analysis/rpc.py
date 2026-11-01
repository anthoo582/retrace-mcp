"""Line-delimited JSON-RPC loop and method dispatch."""

from __future__ import annotations

import json
import sys
import time
from typing import Any, Callable, IO

from . import VERSION, PROTOCOL
from . import elf, envprobe, memory, mips, rom
from .errors import RetraceError

Handler = Callable[[dict[str, Any]], dict[str, Any]]

METHODS: dict[str, Handler] = {
    "system.health": lambda _params: envprobe.health(),
    "env.probe": envprobe.probe,
    "mips.disassemble": mips.disassemble,
    "mips.analyze_function": mips.analyze_function,
    "elf.inspect": elf.inspect,
    "elf.symbols": elf.symbols,
    "elf.resolve": elf.resolve,
    "rom.identify": rom.identify,
    "rom.inspect": rom.inspect,
    "memory.classify_address": memory.classify,
    "memory.resolve": memory.resolve,
}


def handle(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Dispatch one method and always return a complete response envelope."""
    started = time.perf_counter()
    request_id = None
    if not isinstance(method, str) or not method:
        return _failure(request_id, RetraceError("method must be a non-empty string", code="INVALID_PARAMS"))
    if params is None:
        params = {}
    if not isinstance(params, dict):
        return _failure(request_id, RetraceError("params must be an object", code="INVALID_PARAMS"))
    handler = METHODS.get(method)
    if handler is None:
        return _failure(
            request_id,
            RetraceError(
                f"unknown method: {method}",
                code="UNSUPPORTED",
                details={"available": sorted(METHODS)},
            ),
        )
    try:
        result = handler(params)
    except RetraceError as exc:
        return _failure(request_id, exc, started)
    except Exception as exc:  # defensive: never leak a traceback as a protocol frame
        return _failure(
            request_id,
            RetraceError(f"internal error: {exc}", code="INTERNAL", details={"type": type(exc).__name__}),
            started,
        )
    return {
        "id": request_id,
        "ok": True,
        "result": result,
        "meta": {"duration_ms": round((time.perf_counter() - started) * 1000, 3), "sidecar": VERSION},
    }


def _failure(request_id: Any, error: RetraceError, started: float | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"id": request_id, "ok": False, "error": error.to_payload()}
    if started is not None:
        payload["meta"] = {"duration_ms": round((time.perf_counter() - started) * 1000, 3), "sidecar": VERSION}
    return payload


def respond(request: Any) -> dict[str, Any]:
    if not isinstance(request, dict):
        return _failure(None, RetraceError("request must be a JSON object", code="INVALID_PARAMS"))
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params", {})
    response = handle(method, params)
    response["id"] = request_id
    return response


def serve(stdin: IO[bytes], stdout: IO[bytes], *, announce: bool = True) -> None:
    if announce:
        _write(stdout, {"event": "ready", "protocol": PROTOCOL, "sidecar": VERSION})
    for raw in stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            request = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            _write(stdout, _failure(None, RetraceError(f"invalid JSON: {exc}", code="PARSE_ERROR")))
            continue
        _write(stdout, respond(request))


def _write(stdout: IO[bytes], payload: dict[str, Any]) -> None:
    stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n")
    stdout.flush()


def main() -> None:
    try:
        serve(sys.stdin.buffer, sys.stdout.buffer)
    except (KeyboardInterrupt, BrokenPipeError):
        pass
