from __future__ import annotations

from retrace_analysis import rpc


def test_relative_paths_are_refused():
    result = rpc.handle("rom.identify", {"path": "relative.z64"})
    assert result["ok"] is False
    assert result["error"]["code"] == "DENIED_PATH"


def test_missing_file_is_not_found(tmp_path):
    result = rpc.handle("rom.identify", {"path": str(tmp_path / "absent.z64")})
    assert result["ok"] is False
    assert result["error"]["code"] == "NOT_FOUND"


def test_directory_is_refused(tmp_path):
    result = rpc.handle("elf.inspect", {"path": str(tmp_path)})
    assert result["ok"] is False
    assert result["error"]["code"] == "DENIED_PATH"


def test_unknown_method_lists_available_methods():
    result = rpc.handle("mips.teleport", {})
    assert result["ok"] is False
    assert result["error"]["code"] == "UNSUPPORTED"
    assert "mips.disassemble" in result["error"]["details"]["available"]


def test_non_object_params_are_rejected():
    result = rpc.handle("system.health", ["nope"])
    assert result["ok"] is False
    assert result["error"]["code"] == "INVALID_PARAMS"
