from __future__ import annotations

from retrace_analysis import rpc
from elf_fixture import build_mips_elf


def test_classifies_documented_regions_for_both_consoles():
    n64 = rpc.handle("memory.classify_address", {"arch": "r4300i", "address": 0xA4600000})["result"]
    assert n64["region"] == "PI"
    assert n64["confidence"] == "confirmed"

    ps2 = rpc.handle("memory.classify_address", {"arch": "r5900", "address": 0x00100000})["result"]
    assert ps2["region"] == "EE main RAM"

    vu = rpc.handle("memory.classify_address", {"arch": "r5900", "address": 0x11008000})["result"]
    assert vu["region"] == "VU1 data memory"


def test_unknown_address_reports_insufficient_not_invalid():
    payload = rpc.handle("memory.classify_address", {"arch": "r5900", "address": 0x5F000000})["result"]
    assert payload["region"] == "unknown"
    assert payload["confidence"] == "insufficient"
    assert payload["limitations"]


def test_alignment_flags():
    payload = rpc.handle("memory.classify_address", {"arch": "r4300i", "address": 0x80000410})["result"]
    alignment = payload["alignment"]
    assert alignment["aligned_to_4"] is True
    assert alignment["aligned_to_16"] is True
    assert alignment["aligned_to_32"] is False


def test_resolve_combines_region_and_symbol(tmp_path):
    path = tmp_path / "synthetic.elf"
    path.write_bytes(build_mips_elf(symbols=(("func_a", 0x80000000, 8),)))
    payload = rpc.handle(
        "memory.resolve",
        {"arch": "r4300i", "elf": str(path), "address": 0x80000004},
    )["result"]
    assert payload["region"]["region"] == "KSEG0 (cached)"
    assert payload["symbol"] == "func_a"
    assert payload["symbol_offset"] == 4
    assert payload["confidence"] in {"confirmed", "very_likely"}


def test_map_input_is_explicitly_unsupported(tmp_path):
    path = tmp_path / "synthetic.elf"
    path.write_bytes(build_mips_elf())
    result = rpc.handle(
        "memory.resolve",
        {"arch": "r4300i", "elf": str(path), "map": "x.map", "address": 0x80000000},
    )
    assert result["ok"] is False
    assert result["error"]["code"] == "UNSUPPORTED"
