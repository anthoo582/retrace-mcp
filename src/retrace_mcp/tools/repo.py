"""Herramientas de inteligencia de repositorio.

Análisis de directorios, detección de lenguajes y sistemas de compilación,
búsqueda de código y dependencias. Todo con la biblioteca estándar (sin
depender de herramientas externas).
"""

from __future__ import annotations

import fnmatch
import os
import re
from collections import Counter
from pathlib import Path

from ..errors import NotFoundError
from ..registry import tool
from ..security import iter_text_files, require_readable

_BUILD_MARKERS = {
    "Makefile": "GNU Make",
    "makefile": "GNU Make",
    "CMakeLists.txt": "CMake",
    "meson.build": "Meson",
    "pyproject.toml": "Python (PEP 621)",
    "setup.py": "Python setuptools",
    "requirements.txt": "Python pip",
    "package.json": "Node.js",
    "pnpm-lock.yaml": "Node.js (pnpm)",
    "Cargo.toml": "Rust/Cargo",
    "go.mod": "Go modules",
    "build.gradle": "Gradle",
    "pom.xml": "Maven",
}

_LANG_BY_EXT = {
    ".c": "C",
    ".h": "C/C++ (header)",
    ".cc": "C++",
    ".cpp": "C++",
    ".hpp": "C++",
    ".s": "Ensamblador",
    ".S": "Ensamblador",
    ".asm": "Ensamblador",
    ".py": "Python",
    ".rs": "Rust",
    ".go": "Go",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".md": "Markdown",
    ".ld": "Linker script",
    ".map": "Mapa de enlazado",
    ".sym": "Símbolos",
    ".mk": "Makefile",
}


def _default_root(path: str) -> Path:
    if not path or path == ".":
        return Path.cwd().resolve()
    return require_readable(path)


@tool
def repo_inspect(path: str = ".", depth: int = 2, max_files: int = 400) -> dict:
    """Inspecciona un repositorio: árbol, lenguajes, sistemas de compilación y estructura.

    Args:
        path: Directorio a inspeccionar (por defecto el actual).
        depth: Profundidad máxima del árbol mostrado.
        max_files: Número máximo de archivos a contar.
    """
    root = _default_root(path)
    if not root.is_dir():
        raise NotFoundError(f"No es un directorio: {root}")

    tree: list[dict] = []
    counts: Counter = Counter()
    build_systems: list[str] = []
    file_count = 0

    def walk(directory: Path, level: int) -> None:
        nonlocal file_count
        if level > depth:
            return
        try:
            entries = sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except OSError:
            return
        for entry in entries:
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                tree.append({"type": "dir", "path": str(entry.relative_to(root)), "depth": level})
                walk(entry, level + 1)
            else:
                file_count += 1
                if file_count <= max_files:
                    tree.append({"type": "file", "path": str(entry.relative_to(root)), "depth": level})
                counts[entry.suffix.lower()] += 1
                if entry.name in _BUILD_MARKERS:
                    build_systems.append(_BUILD_MARKERS[entry.name])

    walk(root, 0)

    languages = {}
    for ext, n in counts.most_common():
        if ext in _LANG_BY_EXT:
            languages[_LANG_BY_EXT[ext]] = n

    return {
        "root": str(root),
        "files_scanned": file_count,
        "build_systems": sorted(set(build_systems)),
        "languages": languages,
        "extensions": dict(counts.most_common(20)),
        "tree": tree,
    }


@tool
def repo_search_code(query: str, path: str = ".", glob: str = "", max_results: int = 50) -> dict:
    """Busca un patrón (regex) en los archivos de texto del repositorio.

    Args:
        query: Expresión regular a buscar (insensible a mayúsculas).
        path: Directorio raíz.
        glob: Filtro de nombre de archivo (ej. ``*.c``), opcional.
        max_results: Límite de coincidencias devueltas.
    """
    root = _default_root(path)
    try:
        pattern = re.compile(query, re.IGNORECASE)
    except re.error as exc:
        from ..errors import ValidationError

        raise ValidationError(f"Regex inválida: {exc}") from exc

    matches: list[dict] = []
    for file in iter_text_files(root):
        if glob and not fnmatch.fnmatch(file.name, glob):
            continue
        try:
            text = file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if pattern.search(line):
                matches.append(
                    {"file": str(file.relative_to(root)), "line": lineno, "text": line.strip()}
                )
                if len(matches) >= max_results:
                    return {"query": query, "total": len(matches), "truncated": True, "matches": matches}
    return {"query": query, "total": len(matches), "truncated": False, "matches": matches}


@tool
def repo_get_build_info(path: str = ".") -> dict:
    """Detecta el sistema de compilación y las herramientas del repositorio."""
    root = _default_root(path)
    found = []
    for name, label in _BUILD_MARKERS.items():
        if (root / name).exists():
            found.append({"file": name, "system": label})
    return {"root": str(root), "build_systems": found}


@tool
def repo_find_dependencies(path: str = ".") -> dict:
    """Extrae dependencias de manifiestos comunes (Python, Node, Rust)."""
    root = _default_root(path)
    deps: dict[str, list[str]] = {}

    req = root / "requirements.txt"
    if req.exists():
        deps["requirements.txt"] = [l.strip() for l in req.read_text(errors="replace").splitlines() if l.strip() and not l.lstrip().startswith("#")]

    pyproject = root / "pyproject.toml"
    if pyproject.exists():
        deps["pyproject.toml"] = ["(ver [project].dependencies)"]

    pkg = root / "package.json"
    if pkg.exists():
        try:
            import json

            data = json.loads(pkg.read_text(encoding="utf-8"))
            deps["package.json"] = sorted({**data.get("dependencies", {}), **data.get("devDependencies", {})})
        except (json.JSONDecodeError, OSError):
            deps["package.json"] = ["(JSON inválido)"]

    cargo = root / "Cargo.toml"
    if cargo.exists():
        deps["Cargo.toml"] = ["(ver [dependencies])"]

    return {"root": str(root), "dependencies": deps}


@tool
def repo_find_references(symbol: str, path: str = ".", max_results: int = 50) -> dict:
    """Busca todas las referencias textuales a un símbolo en el código fuente.

    Args:
        symbol: Identificador a buscar (nombre de función/variable).
        path: Directorio raíz.
        max_results: Límite de coincidencias.
    """
    root = _default_root(path)
    needle = re.compile(rf"\b{re.escape(symbol)}\b")
    matches: list[dict] = []
    for file in iter_text_files(root):
        try:
            text = file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if needle.search(line):
                matches.append(
                    {"file": str(file.relative_to(root)), "line": lineno, "text": line.strip()}
                )
                if len(matches) >= max_results:
                    return {"symbol": symbol, "total": len(matches), "truncated": True, "matches": matches}
    return {"symbol": symbol, "total": len(matches), "truncated": False, "matches": matches}
