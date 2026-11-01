"""Tests para herramientas de análisis de memoria y crash forensics."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest


def test_memory_analyze_dump_reports_statistics(tmp_path: Path) -> None:
    """memory_analyze_dump debe reportar estadísticas básicas del dump."""
    from retrace_mcp.tools.memory import memory_analyze_dump

    # Crear dump sintético: 1KB con patrón mixto
    data = b"\x00" * 256 + b"\xff" * 256 + b"ABCD" * 128
    dump_file = tmp_path / "test.dump"
    dump_file.write_bytes(data)

    result = memory_analyze_dump(str(dump_file), base_address=0x80000000, endian="little")

    assert result["ok"] is True
    data_dict = result["data"]
    assert data_dict["size_bytes"] == 1024
    assert data_dict["base_address"] == "0x80000000"
    assert data_dict["statistics"]["zero_bytes"] == 256
    assert data_dict["statistics"]["zero_percent"] == 25.0
    assert data_dict["statistics"]["ff_bytes"] == 256


def test_memory_inspect_region_shows_hex_and_uint32s(tmp_path: Path) -> None:
    """memory_inspect_region debe mostrar hex, uint32s y strings."""
    from retrace_mcp.tools.memory import memory_inspect_region

    # Dump con datos reconocibles
    data = b"\x01\x02\x03\x04" + b"Hello World!\x00" + b"\xFF" * 100
    dump_file = tmp_path / "test.dump"
    dump_file.write_bytes(data)

    result = memory_inspect_region(str(dump_file), offset=0, size=32, endian="big")

    assert result["ok"] is True
    data_dict = result["data"]
    assert data_dict["offset"] == 0
    assert data_dict["size"] == 32
    assert "hex" in data_dict
    assert len(data_dict["uint32s"]) > 0
    assert data_dict["uint32s"][0] == "0x1020304"
    assert "Hello World!" in " ".join(data_dict["strings"])


def test_memory_find_pointer_locates_references(tmp_path: Path) -> None:
    """memory_find_pointer debe encontrar referencias a una dirección."""
    from retrace_mcp.tools.memory import memory_find_pointer

    target = 0x80001234
    # Crear dump con target en 3 posiciones
    data = (
        target.to_bytes(4, "little")
        + b"\x00" * 12
        + target.to_bytes(4, "little")
        + b"\xFF" * 8
        + target.to_bytes(4, "little")
    )
    dump_file = tmp_path / "test.dump"
    dump_file.write_bytes(data)

    result = memory_find_pointer(str(dump_file), target_address=target, endian="little")

    assert result["ok"] is True
    data_dict = result["data"]
    assert data_dict["found_count"] == 3
    assert data_dict["references"][0]["offset"] == 0
    assert data_dict["references"][1]["offset"] == 16
    assert data_dict["references"][2]["offset"] == 28


def test_memory_check_alignment_detects_misalignment() -> None:
    """memory_check_alignment debe detectar direcciones desalineadas."""
    from retrace_mcp.tools.memory import memory_check_alignment

    # Alineado
    result = memory_check_alignment(0x80000000, alignment=4)
    assert result["ok"] is True
    assert result["data"]["is_aligned"] is True
    assert result["data"]["offset"] == 0

    # Desalineado
    result = memory_check_alignment(0x80000001, alignment=4)
    assert result["ok"] is True
    assert result["data"]["is_aligned"] is False
    assert result["data"]["offset"] == 1
    assert result["data"]["next_aligned"] == "0x80000004"


def test_memory_analyze_overlap_detects_overlapping_regions() -> None:
    """memory_analyze_overlap debe detectar superposición de regiones."""
    from retrace_mcp.tools.memory import memory_analyze_overlap

    # Regiones superpuestas
    result = memory_analyze_overlap(
        region1_start=0x1000, region1_size=0x400, region2_start=0x1200, region2_size=0x300
    )
    assert result["ok"] is True
    data = result["data"]
    assert data["overlaps"] is True
    assert data["overlap"]["start"] == "0x1200"
    assert data["overlap"]["size"] == 0x200

    # Regiones separadas
    result = memory_analyze_overlap(
        region1_start=0x1000, region1_size=0x100, region2_start=0x2000, region2_size=0x100
    )
    assert result["ok"] is True
    assert result["data"]["overlaps"] is False


def test_crash_analyze_parses_pcsx2_format() -> None:
    """crash_analyze debe parsear logs de PCSX2."""
    from retrace_mcp.tools.memory import crash_analyze

    crash_log = """
    PC: 0x00100000
    RA: 0x00100020
    SP: 0x01fff800
    GP: 0x00200000
    """

    result = crash_analyze(crash_log, arch="r5900")

    assert result["ok"] is True
    data = result["data"]
    assert data["arch"] == "r5900"
    assert data["context"]["registers"]["pc"] == "0x100000"
    assert data["context"]["registers"]["gpr"]["ra"] == "0x100020"
    assert data["context"]["registers"]["gpr"]["sp"] == "0x1fff800"


def test_crash_analyze_detects_invalid_pointers() -> None:
    """crash_analyze debe detectar punteros inválidos."""
    from retrace_mcp.tools.memory import crash_analyze

    # PC nulo = problema crítico
    crash_log = """
    PC: 0x00000000
    RA: 0x80000020
    SP: 0x01fff800
    """

    result = crash_analyze(crash_log, arch="r5900")

    assert result["ok"] is True
    analysis = result["data"]["analysis"]
    assert len(analysis["issues"]) > 0
    assert analysis["severity"] == "high"
    assert any("PC inválido" in issue for issue in analysis["issues"])


def test_crash_resolve_address_finds_closest_symbol() -> None:
    """crash_resolve_address debe encontrar el símbolo más cercano."""
    from retrace_mcp.tools.memory import crash_resolve_address

    symbols = {
        "main": 0x100000,
        "game_loop": 0x100400,
        "render_frame": 0x100800,
    }

    # Dirección dentro de game_loop
    result = crash_resolve_address(0x100420, symbols_data=symbols)

    assert result["ok"] is True
    data = result["data"]
    assert data["symbol"] == "game_loop"
    assert data["symbol_address"] == "0x100400"
    assert data["offset"] == 0x20
    assert data["formatted"] == "game_loop+0x20"

    # Sin símbolos
    result = crash_resolve_address(0x100420)
    assert result["ok"] is True
    assert result["data"]["symbol"] is None


def test_memory_tools_reject_invalid_inputs(tmp_path: Path) -> None:
    """Las herramientas de memoria deben rechazar inputs inválidos."""
    from retrace_mcp.tools.memory import (
        memory_check_alignment,
        memory_inspect_region,
    )

    dump_file = tmp_path / "small.dump"
    dump_file.write_bytes(b"\x00" * 100)

    # Offset fuera de rango
    result = memory_inspect_region(str(dump_file), offset=200, size=10)
    assert result["ok"] is False
    assert result["error"]["code"] == "VALIDATION_ERROR"

    # Tamaño inválido
    result = memory_inspect_region(str(dump_file), offset=0, size=-1)
    assert result["ok"] is False

    # Alineación inválida
    result = memory_check_alignment(0x1000, alignment=0)
    assert result["ok"] is False


def test_analyze_pointer_detects_common_issues() -> None:
    """El análisis de punteros debe detectar problemas comunes."""
    from retrace_mcp.parsers.memory import analyze_pointer

    # Puntero nulo
    result = analyze_pointer(0x00000000, arch="mips32")
    assert not result["is_valid"]
    assert "null_pointer" in result["issues"]

    # Puntero desalineado
    result = analyze_pointer(0x80000001, arch="mips32")
    assert not result["is_valid"]
    assert "misaligned" in result["issues"]

    # Puntero válido
    result = analyze_pointer(0x80000000, arch="mips32")
    assert result["is_valid"]
    assert len(result["issues"]) == 0


def test_memory_dump_class_basic_operations() -> None:
    """MemoryDump debe soportar operaciones básicas."""
    from retrace_mcp.parsers.memory import MemoryDump

    data = b"\x12\x34\x56\x78" + b"TEST" * 10
    dump = MemoryDump(data, base_address=0x80000000)

    assert dump.size == len(data)
    assert dump.base_address == 0x80000000

    # Lectura big-endian
    value_be = dump.read_u32_be(0)
    assert value_be == 0x12345678

    # Lectura little-endian
    value_le = dump.read_u32_le(0)
    assert value_le == 0x78563412

    # Lectura de bytes
    chunk = dump.read_bytes(4, 4)
    assert chunk == b"TEST"


def test_cpu_registers_storage_and_retrieval() -> None:
    """CPURegisters debe almacenar y recuperar registros."""
    from retrace_mcp.parsers.memory import CPURegisters

    regs = CPURegisters("r5900")
    regs.pc = 0x100000
    regs.set_gpr("ra", 0x100020)
    regs.set_gpr("sp", 0x1FFF800)

    assert regs.pc == 0x100000
    assert regs.get_gpr("ra") == 0x100020
    assert regs.get_gpr("sp") == 0x1FFF800
    assert regs.get_gpr("nonexistent") is None

    # Conversión a dict
    d = regs.to_dict()
    assert d["pc"] == "0x100000"
    assert d["gpr"]["ra"] == "0x100020"


def test_extract_stack_trace_finds_return_addresses() -> None:
    """extract_stack_trace debe encontrar direcciones de retorno."""
    from retrace_mcp.parsers.memory import extract_stack_trace

    # Stack con direcciones de código mezcladas con datos
    stack = (
        (0x80001234).to_bytes(4, "little")  # Posible RA
        + b"\x00\x00\x00\x00"  # Datos
        + (0x80005678).to_bytes(4, "little")  # Posible RA
        + b"\xFF\xFF\xFF\xFF"  # Datos
    )

    addresses = extract_stack_trace(stack, stack_base=0x1FFF000, arch="mips32_le")

    assert len(addresses) >= 2
    assert 0x80001234 in addresses
    assert 0x80005678 in addresses
