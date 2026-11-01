"""Controles de seguridad para el acceso al sistema de archivos.

Reglas aplicadas a toda operación de lectura/escritura:

* Protección contra *path traversal*: las rutas se resuelven y deben quedar
  dentro de una raíz permitida.
* Límite de tamaño para archivos binarios.
* Los binarios analizados se tratan SIEMPRE como datos no confiables; nunca
  se ejecuta código extraído de una ROM, ELF o dump.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from .errors import SecurityError, ValidationError

MAX_ANALYSIS_BYTES = 256 * 1024 * 1024  # 256 MiB por defecto

# Extensiones consideradas "de texto" para búsquedas de código fuente.
_TEXT_EXTENSIONS = {
    ".c", ".h", ".cc", ".cpp", ".hpp", ".s", ".S", ".asm", ".py", ".rs",
    ".go", ".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml", ".toml",
    ".xml", ".md", ".txt", ".ld", ".map", ".sym", ".mk", ".cmake", ".sh",
    ".ps1", ".bat", ".inc", ".cfg", ".ini",
}


def resolve_within(path: str | os.PathLike, base: str | os.PathLike) -> Path:
    """Resuelve ``path`` y exige que quede dentro de ``base``.

    Lanza :class:`SecurityError` si la ruta escapa de la raíz permitida.
    """
    base_p = Path(base).expanduser().resolve()
    p = Path(path).expanduser()
    if not p.is_absolute():
        p = base_p / p
    resolved = p.resolve()
    if not (resolved == base_p or base_p in resolved.parents):
        raise SecurityError(f"Ruta fuera de la raíz permitida: {path}")
    return resolved


def require_readable(path: str | os.PathLike) -> Path:
    p = Path(path).expanduser()
    if not p.exists():
        from .errors import NotFoundError

        raise NotFoundError(f"No existe: {p}")
    if not os.access(p, os.R_OK):
        raise SecurityError(f"Sin permiso de lectura: {p}")
    return p.resolve()


def check_size(path: str | os.PathLike, limit: int = MAX_ANALYSIS_BYTES) -> int:
    p = Path(path)
    if not p.is_file():
        raise ValidationError(f"No es un archivo regular: {p}")
    size = p.stat().st_size
    if size > limit:
        raise ValidationError(
            f"Archivo demasiado grande: {size} bytes (límite {limit}). "
            "Aumenta RETRACE_MAX_FILE_BYTES si es intencional."
        )
    return size


def read_bytes(path: str | os.PathLike, limit: int = MAX_ANALYSIS_BYTES) -> bytes:
    p = require_readable(path)
    check_size(p, limit)
    return p.read_bytes()


def is_text_file(path: str | os.PathLike) -> bool:
    return Path(path).suffix.lower() in _TEXT_EXTENSIONS


def is_binary_data(data: bytes) -> bool:
    """Heurística simple: presencia de bytes NUL en las primeras 8 KiB."""
    return b"\x00" in data[:8192]


def iter_text_files(root: str | os.PathLike, skip_hidden: bool = True) -> Iterable[Path]:
    base = Path(root).expanduser().resolve()
    for dirpath, dirnames, filenames in os.walk(base):
        if skip_hidden:
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for name in filenames:
            if skip_hidden and name.startswith("."):
                continue
            p = Path(dirpath) / name
            if is_text_file(p):
                yield p
