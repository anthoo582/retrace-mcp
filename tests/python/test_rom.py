from __future__ import annotations

import pytest

from retrace_analysis import rpc
from retrace_analysis.fixtures import synthetic_rom


@pytest.mark.parametrize(
    ("byte_order", "endianness"),
    [("z64", "big"), ("v64", "byteswapped"), ("n64", "little")],
)
def test_all_three_byte_orders_are_identified(tmp_path, byte_order, endianness):
    path = tmp_path / f"synthetic.{byte_order}"
    path.write_bytes(synthetic_rom(byte_order=byte_order, name="RETRACE TEST"))
    payload = rpc.handle("rom.identify", {"path": str(path)})["result"]
    assert payload["recognised"] is True
    assert payload["byte_order"] == byte_order
    assert payload["endianness"] == endianness
    assert payload["header"]["entry_point"] == 0x80000400
    assert payload["header"]["image_name"] == "RETRACE TEST"
    assert payload["header"]["country_code"]["name"].startswith("North America")


def test_inspect_reports_size_and_limitations(tmp_path):
    path = tmp_path / "synthetic.z64"
    path.write_bytes(synthetic_rom(size=0x2000))
    payload = rpc.handle("rom.inspect", {"path": str(path)})["result"]
    assert payload["file_size"] == 0x2000
    assert payload["size_multiple_of_1_mib"] is False
    assert payload["header"]["crc1"] == 0x12345678
    joined = " ".join(payload["limitations"]).lower()
    assert "crc" in joined and "not verified" in joined


def test_non_n64_file_is_not_claimed_as_rom(tmp_path):
    path = tmp_path / "random.bin"
    path.write_bytes(b"\xde\xad\xbe\xef" + b"\x00" * 124)
    payload = rpc.handle("rom.identify", {"path": str(path)})["result"]
    assert payload["recognised"] is False
    assert payload["confidence"] == "insufficient"
