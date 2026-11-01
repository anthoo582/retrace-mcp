from __future__ import annotations

from retrace_analysis import rpc
from elf_fixture import build_mips_elf


def _write(tmp_path, **kwargs):
    blob = build_mips_elf(symbols=(("func_a", 0x80000000, 8), ("func_b", 0x80000008, 8)), **kwargs)
    path = tmp_path / "synthetic.elf"
    path.write_bytes(blob)
    return path


def test_inspect_reports_real_header_fields(tmp_path):
    path = _write(tmp_path, entry=0x80000000)
    result = rpc.handle("elf.inspect", {"path": str(path)})
    assert result["ok"] is True
    payload = result["result"]
    assert payload["header"]["machine"] == "EM_MIPS"
    assert payload["header"]["elf_class"] == "ELFCLASS32"
    assert payload["header"]["entry"] == 0x80000000
    assert payload["counts"]["functions"] == 2
    assert payload["has_symbol_table"] is True
    assert payload["sha256"]
    names = {section["name"] for section in payload["sections"]}
    assert {".text", ".symtab", ".strtab"} <= names


def test_little_endian_variant_is_parsed(tmp_path):
    path = _write(tmp_path, little_endian=True)
    payload = rpc.handle("elf.inspect", {"path": str(path)})["result"]
    assert payload["header"]["data_encoding"] == "ELFDATA2LSB"


def test_symbols_filter_and_limit(tmp_path):
    path = _write(tmp_path)
    payload = rpc.handle("elf.symbols", {"path": str(path), "kind": "function"})["result"]
    names = [row["name"] for row in payload["symbols"]]
    assert names == ["func_a", "func_b"]
    assert all(row["kind"] == "function" for row in payload["symbols"])

    limited = rpc.handle("elf.symbols", {"path": str(path), "limit": 1})["result"]
    assert limited["returned"] == 1
    assert limited["truncated"] is True


def test_resolve_maps_address_to_symbol_and_section(tmp_path):
    path = _write(tmp_path)
    payload = rpc.handle("elf.resolve", {"path": str(path), "address": 0x8000000C})["result"]
    assert payload["symbol"] == "func_b"
    assert payload["offset"] == 4
    assert payload["section"] == ".text"
    assert payload["confidence"] == "very_likely"


def test_non_elf_is_a_parse_error(tmp_path):
    bad = tmp_path / "not.elf"
    bad.write_bytes(b"not an elf at all")
    result = rpc.handle("elf.inspect", {"path": str(bad)})
    assert result["ok"] is False
    assert result["error"]["code"] == "PARSE_ERROR"
