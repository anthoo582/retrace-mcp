"""Environment probe: which real reverse-engineering tools this machine has.

Every entry names a tool the MCP can drive, where it looked, and whether it was
found. Missing tools are reported as missing — never simulated.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from .errors import invalid_params

VERSION_TIMEOUT_SECONDS = 5

# id -> (kind, candidate executable names, candidate absolute paths)
EXECUTABLES: dict[str, tuple[str, tuple[str, ...], tuple[str, ...]]] = {
    "ps2-gcc": ("compiler", ("mips64r5900el-ps2-elf-gcc",), ("D:/ps2dev/ee/bin/mips64r5900el-ps2-elf-gcc.exe",)),
    "ps2-objdump": ("binutils", ("mips64r5900el-ps2-elf-objdump",), ("D:/ps2dev/ee/bin/mips64r5900el-ps2-elf-objdump.exe",)),
    "ps2-readelf": ("binutils", ("mips64r5900el-ps2-elf-readelf",), ("D:/ps2dev/ee/bin/mips64r5900el-ps2-elf-readelf.exe",)),
    "ps2-nm": ("binutils", ("mips64r5900el-ps2-elf-nm",), ("D:/ps2dev/ee/bin/mips64r5900el-ps2-elf-nm.exe",)),
    "ps2-gdb": ("debugger", ("mips64r5900el-ps2-elf-gdb",), ("D:/ps2dev/ee/bin/mips64r5900el-ps2-elf-gdb.exe",)),
    "objdump": ("binutils", ("objdump", "llvm-objdump"), ()),
    "readelf": ("binutils", ("readelf", "llvm-readelf"), ()),
    "nm": ("binutils", ("nm", "llvm-nm"), ()),
    "strings": ("binutils", ("strings",), ()),
    "make": ("build", ("make", "gmake", "mingw32-make"), ()),
    "pcsx2": ("emulator", ("pcsx2-qt", "pcsx2"), ("D:/emuladores/PCSX2/pcsx2-qt.exe",)),
    "radare2": ("disassembler", ("r2", "radare2"), ()),
    "r2": ("disassembler", ("r2", "radare2"), ()),
    "ghidra": ("disassembler", ("ghidraRun", "analyzeHeadless"), ()),
    "java": ("runtime", ("java",), ()),
    "git": ("vcs", ("git",), ()),
}

PYTHON_MODULES = {
    "capstone": "MIPS/ARM/x86 disassembly engine used by mips.* methods",
    "elftools": "pyelftools, used by elf.* methods",
}

PS2SDK_DIRS = ("D:/ps2dev", "C:/ps2dev", os.environ.get("PS2DEV", ""))


def _version_of(path: Path) -> str | None:
    for flag in ("--version", "-version", "-v"):
        try:
            completed = subprocess.run(
                [str(path), flag],
                capture_output=True,
                text=True,
                timeout=VERSION_TIMEOUT_SECONDS,
                shell=False,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        text = (completed.stdout or completed.stderr or "").strip()
        if text:
            return text.splitlines()[0][:200]
    return None


def _find(candidates: tuple[str, ...], absolute: tuple[str, ...]) -> Path | None:
    for raw in absolute:
        if not raw:
            continue
        candidate = Path(raw)
        if candidate.is_file():
            return candidate
    for name in candidates:
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def probe(params: dict[str, Any]) -> dict[str, Any]:
    extra_paths = params.get("extra_paths", [])
    if extra_paths is None:
        extra_paths = []
    if not isinstance(extra_paths, list) or not all(isinstance(item, str) for item in extra_paths):
        raise invalid_params("extra_paths must be a list of strings", field="extra_paths")

    original_path = os.environ.get("PATH", "")
    resolved_extra: list[str] = []
    for raw in extra_paths:
        candidate = Path(raw).expanduser()
        if not candidate.is_absolute():
            raise invalid_params("extra_paths entries must be absolute", value=raw)
        if candidate.is_dir():
            resolved_extra.append(str(candidate))
    if resolved_extra:
        os.environ["PATH"] = os.pathsep.join(resolved_extra + [original_path])

    try:
        tools: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for tool_id, (kind, names, absolute) in EXECUTABLES.items():
            if tool_id in seen_ids:
                continue
            seen_ids.add(tool_id)
            found = _find(names, absolute)
            entry: dict[str, Any] = {
                "id": tool_id,
                "kind": kind,
                "found": found is not None,
                "path": str(found) if found else None,
                "version": _version_of(found) if found else None,
            }
            if not found:
                entry["notes"] = "not present on PATH or at a known install location"
            tools.append(entry)
    finally:
        os.environ["PATH"] = original_path

    modules: list[dict[str, Any]] = []
    for name, description in PYTHON_MODULES.items():
        spec = importlib.util.find_spec(name)
        entry = {
            "id": name,
            "kind": "python-module",
            "found": spec is not None,
            "description": description,
        }
        if spec is not None:
            try:
                module = __import__(name)
                entry["version"] = getattr(module, "__version__", None)
            except Exception as exc:  # pragma: no cover
                entry["notes"] = f"importable but failed to import: {exc}"
        modules.append(entry)

    ps2dev_dirs = []
    for raw in PS2SDK_DIRS:
        if not raw:
            continue
        candidate = Path(raw)
        ps2dev_dirs.append({
            "path": str(candidate),
            "exists": candidate.is_dir(),
            "has_ee_toolchain": (candidate / "ee" / "bin").is_dir(),
            "has_ps2sdk": (candidate / "ps2sdk").is_dir(),
        })

    return {
        "python": {"executable": sys.executable, "version": sys.version.split()[0]},
        "executables": tools,
        "python_modules": modules,
        "ps2dev_installations": ps2dev_dirs,
        "contains_real_data": False,
        "evidence": {"source": "filesystem and PATH", "tool": "builtin"},
        "limitations": [
            "Detection is name/path based; a found binary is not validated against the analysed target.",
            "extra_paths is temporary for this probe only and is not persisted.",
        ],
    }


def health() -> dict[str, Any]:
    from . import VERSION

    return {
        "sidecar": VERSION,
        "protocol": 1,
        "python": {"executable": sys.executable, "version": sys.version.split()[0]},
        "capstone": {"found": importlib.util.find_spec("capstone") is not None, "version": _module_version("capstone")},
        "pyelftools": {"found": importlib.util.find_spec("elftools") is not None, "version": _module_version("elftools")},
        "platform": sys.platform,
    }


def _module_version(name: str) -> str | None:
    try:
        module = __import__(name)
    except Exception:
        return None
    return getattr(module, "__version__", None)
