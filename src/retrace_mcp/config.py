"""Configuración del servidor.

Las opciones se leen por orden de precedencia:
  1. Variables de entorno ``RETRACE_*``.
  2. Archivo JSON ``retrace.json`` en el directorio actual (opcional).

Ningún secreto debe ir en el archivo de configuración: para credenciales se
usan variables de entorno (véase ``configs/`` para los clientes).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    transport: str = "stdio"
    host: str = "127.0.0.1"
    port: int = 8420
    target_repo: str | None = None
    work_dir: str | None = None
    log_level: str = "INFO"
    max_file_bytes: int = 256 * 1024 * 1024
    external_timeout_sec: int = 30
    enable_http: bool = False

    @property
    def is_http(self) -> bool:
        return self.transport in ("streamable-http", "sse")

    def resolve_target(self) -> Path | None:
        """Devuelve el directorio objetivo a analizar, si está definido."""
        if not self.target_repo:
            return None
        p = Path(self.target_repo).expanduser().resolve()
        return p if p.exists() else None


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def load_settings() -> Settings:
    cfg = _load_json(Path("retrace.json"))

    def pick(env: str, key: str, default: object) -> object:
        return os.environ.get(env) if os.environ.get(env) else cfg.get(key, default)

    transport = str(pick("RETRACE_TRANSPORT", "transport", "stdio"))
    return Settings(
        transport=transport,
        host=str(pick("RETRACE_HOST", "host", "127.0.0.1")),
        port=int(pick("RETRACE_PORT", "port", 8420)),
        target_repo=os.environ.get("RETRACE_TARGET") or cfg.get("target_repo"),
        work_dir=os.environ.get("RETRACE_WORKDIR") or cfg.get("work_dir"),
        log_level=str(pick("RETRACE_LOG_LEVEL", "log_level", "INFO")),
        max_file_bytes=int(pick("RETRACE_MAX_FILE_BYTES", "max_file_bytes", 256 * 1024 * 1024)),
        external_timeout_sec=int(
            pick("RETRACE_EXTERNAL_TIMEOUT", "external_timeout_sec", 30)
        ),
        enable_http=transport in ("streamable-http", "sse"),
    )
