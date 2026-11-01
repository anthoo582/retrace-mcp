"""Address classification and symbol resolution across architectures."""

from __future__ import annotations

from typing import Any

from . import elf as elf_module
from .errors import invalid_params, unsupported
from .paths import checked_path
from .regions import alignment_report, classify_address, normalize_arch


def _address(params: dict[str, Any]) -> int:
    raw = params.get("address")
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0:
        raise invalid_params("address must be a non-negative integer", field="address")
    return raw


def classify(params: dict[str, Any]) -> dict[str, Any]:
    arch = normalize_arch(params.get("arch"))
    address = _address(params)
    result = classify_address(arch, address)
    result["alignment"] = alignment_report(address)
    return result


def resolve(params: dict[str, Any]) -> dict[str, Any]:
    address = _address(params)
    if params.get("map") is not None:
        raise unsupported(
            "linker .map symbol tables are not parsed yet",
            hint="Pass elf= instead, or wait for map support in a later revision.",
        )

    elf_path = params.get("elf")
    arch = params.get("arch")
    if arch is None and elf_path is None:
        raise invalid_params("provide arch, elf, or both")
    if arch is not None:
        arch = normalize_arch(arch)

    result: dict[str, Any] = {
        "address": address,
        "alignment": alignment_report(address),
        "confidence": "insufficient",
        "evidence": [],
        "limitations": [],
    }

    if arch is not None:
        classification = classify_address(arch, address)
        result["arch"] = arch
        result["region"] = classification
        result["evidence"].append({"source": "Documented memory map", "tool": "builtin"})
        result["confidence"] = "confirmed" if classification["region"] != "unknown" else "insufficient"

    if elf_path is not None:
        path = checked_path(elf_path, field="elf")
        resolved = elf_module.resolve({"path": str(path), "address": address})
        result["symbol"] = resolved.get("symbol")
        result["symbol_offset"] = resolved.get("offset")
        result["section"] = resolved.get("section")
        result["symbol_kind"] = resolved.get("symbol_kind")
        result["evidence"].append({"source": str(path), "tool": "pyelftools"})
        if resolved.get("symbol"):
            result["confidence"] = "confirmed" if resolved["confidence"] == "confirmed" else "very_likely"
            result["limitations"].extend(resolved.get("limitations", []))
        else:
            result["limitations"].append("No symbol at or below this address in the given ELF.")

    if result["confidence"] == "insufficient":
        result["limitations"].append(
            "Neither a documented region nor a symbol covers this address; no conclusion is claimed."
        )
    return result
