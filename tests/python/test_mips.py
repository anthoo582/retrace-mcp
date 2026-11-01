from __future__ import annotations

import subprocess
import sys

import pytest

from retrace_analysis import rpc

MIPS_LE = {
    "addiu sp,sp,-32": "e0ffbd27",
    "sw ra,28(sp)": "1c00bfaf",
    "jr ra": "0800e003",
    "nop": "00000000",
}


def test_disassemble_n64_prologue_and_call():
    data_hex = "27bdffe0afbf001c0c00000000000000"
    result = rpc.handle("mips.disassemble", {"data_hex": data_hex, "address": 0x80000400, "arch": "r4300i"})
    assert result["ok"] is True
    payload = result["result"]
    assert payload["arch"] == "r4300i"
    assert payload["endian"] == "big"
    assert payload["instruction_count"] == 4
    mnemonics = [insn["mnemonic"] for insn in payload["instructions"]]
    assert mnemonics[0] == "addiu"
    assert mnemonics[1] == "sw"
    assert mnemonics[2] == "jal"
    assert payload["instructions"][0]["address"] == 0x80000400
    assert payload["bytes_consumed"] == 16


def test_analyze_function_detects_prologue_frame_and_return():
    # addiu sp,sp,-32 ; sw ra,28(sp) ; jal 0x80000500 ; nop ; ... ; jr ra ; nop
    data_hex = "27bdffe0afbf001c0c0001400000000003e0000800000000"
    result = rpc.handle("mips.analyze_function", {"data_hex": data_hex, "address": 0x80000400, "arch": "r4300i"})
    payload = result["result"]
    assert payload["prologue"]["frame_size"] == 32
    assert payload["prologue"]["saves_ra"] is True
    assert payload["returns"], "jr $ra must be detected as a return"
    assert payload["calls"][0]["kind"] == "direct"
    assert payload["calls"][0]["target"] == 0x80000500
    assert payload["confidence"] == "confirmed"
    assert payload["estimated_size"] > 0
    assert payload["basic_blocks"]


def test_r5900_is_little_endian_and_not_confused_with_r4300i():
    data_hex = "e0ffbd271c00bfaf0800e00300000000"
    result = rpc.handle(
        "mips.analyze_function",
        {"data_hex": data_hex, "address": 0x00100000, "arch": "r5900"},
    )
    payload = result["result"]
    assert payload["arch"] == "r5900"
    assert payload["endian"] == "little"
    assert payload["instructions"][0]["mnemonic"] == "addiu"
    joined = " ".join(payload["limitations"]).lower()
    assert "cop2" in joined or "vu0" in joined


def test_rejects_unknown_arch_and_bad_hex():
    bad_arch = rpc.handle("mips.disassemble", {"data_hex": "00000000", "arch": "x86"})
    assert bad_arch["ok"] is False
    assert bad_arch["error"]["code"] == "UNSUPPORTED"

    bad_hex = rpc.handle("mips.disassemble", {"data_hex": "zz", "arch": "r4300i"})
    assert bad_hex["ok"] is False
    assert bad_hex["error"]["code"] == "INVALID_PARAMS"


def test_sidecar_process_speaks_line_json():
    completed = subprocess.run(
        [sys.executable, "-m", "retrace_analysis"],
        input=b'{"id":1,"method":"system.health","params":{}}\nnot json\n',
        capture_output=True,
        cwd=str((__import__("pathlib").Path(__file__).resolve().parents[2] / "src" / "python")),
        timeout=60,
    )
    lines = [line for line in completed.stdout.decode("utf-8").splitlines() if line.strip()]
    assert '"event":"ready"' in lines[0]
    assert '"ok":true' in lines[1]
    assert '"code":"PARSE_ERROR"' in lines[2]


@pytest.mark.parametrize("method", ["system.health", "env.probe"])
def test_health_and_probe_do_not_claim_absent_tools(method):
    result = rpc.handle(method, {})
    assert result["ok"] is True
    payload = result["result"]
    if method == "env.probe":
        assert payload["contains_real_data"] is False
        for entry in payload["executables"]:
            if not entry["found"]:
                assert entry["path"] is None
    else:
        assert payload["protocol"] == 1
