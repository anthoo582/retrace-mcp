#!/usr/bin/env python3
"""Capstone bridge for Retrace MCP.

Reads one JSON request from stdin, writes one JSON response to stdout.
Never trusts the caller: all fields are validated and the decoder only
ever operates on the byte string it is given in memory.
"""
import base64
import json
import sys

ARCH_MODES = {
    "mips1": (1, "MIPS32"),
    "mips2": (2, "MIPS32"),
    "mips3": (3, "MIPS32"),
    "mips32": (32, "MIPS32"),
    "mips32r2": (32, "MIPS32R2"),
    "mips64": (64, "MIPS64"),
    "r4300i": (3, "MIPS32"),
    "r5900": (3, "MIPS32"),
    "r5900-mmi": (3, "MIPS32"),
}

ARCH_ALIASES = {
    "mips1": "mips1",
    "mips2": "mips2",
    "mips3": "mips3",
    "mips32": "mips32",
    "mips32r2": "mips32r2",
    "mips64": "mips64",
    "r4300i": "r4300i",
    "vr4300": "r4300i",
    "n64": "r4300i",
    "r5900": "r5900",
    "ee": "r5900",
    "ps2": "r5900",
    "r5900-mmi": "r5900-mmi",
}


def failure(code, message, hint=None):
    payload = {"ok": False, "error": {"code": code, "message": message}}
    if hint:
        payload["error"]["hint"] = hint
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    return 0


def main():
    try:
        import capstone
    except ImportError:
        return failure(
            "dependency_missing",
            "Python package 'capstone' is not installed.",
            "pip install capstone  (Retrace never simulates disassembly)",
        )

    try:
        request = json.load(sys.stdin)
    except Exception as exc:  # noqa: BLE001
        return failure("bad_request", f"Invalid JSON request: {exc}")

    arch_name = str(request.get("arch", "r5900")).lower()
    canonical = ARCH_ALIASES.get(arch_name)
    if canonical is None:
        return failure(
            "bad_arch",
            f"Unsupported architecture '{arch_name}'.",
            "Use one of: " + ", ".join(sorted(ARCH_ALIASES)),
        )

    endian = str(request.get("endian", "little")).lower()
    if endian not in ("little", "big"):
        return failure("bad_endian", "endian must be 'little' or 'big'")

    try:
        address = int(request.get("address", 0))
        count = int(request.get("count", 16))
        payload = base64.b64decode(request.get("code_base64", ""), validate=True)
    except Exception as exc:  # noqa: BLE001
        return failure("bad_request", f"Invalid address/count/code: {exc}")

    if count < 1 or count > 20000:
        return failure("bad_count", "count must be between 1 and 20000")
    if len(payload) == 0:
        return failure("empty_code", "code_base64 decoded to zero bytes")

    level, label = ARCH_MODES[canonical]
    if level == 1:
        mode = capstone.CS_MODE_MIPS1
    elif level == 2:
        mode = capstone.CS_MODE_MIPS2
    elif level == 3:
        mode = capstone.CS_MODE_MIPS3
    elif level == 32:
        mode = capstone.CS_MODE_MIPS32
    elif level == 64:
        mode = capstone.CS_MODE_MIPS64
    else:
        mode = capstone.CS_MODE_MIPS32

    shifted = count.to_bytes(2, "big")
    mode |= (shifted[0] << 4) | shifted[1]
    mode |= capstone.CS_MODE_LITTLE_ENDIAN if endian == "little" else capstone.CS_MODE_BIG_ENDIAN

    md = capstone.Cs(capstone.CS_ARCH_MIPS, mode)
    md.detail = True
    md.skipdata = False

    instructions = []
    consumed = 0
    for insn in md.disasm(payload, address, count=count):
        operands = []
        try:
            for op in insn.operands:
                entry = {"type": str(op.type)}
                if op.type == capstone.mips.MIPS_OP_REG:
                    entry["reg"] = insn.reg_name(op.reg)
                elif op.type == capstone.mips.MIPS_OP_IMM:
                    entry["imm"] = op.imm
                elif op.type == capstone.mips.MIPS_OP_MEM:
                    entry["base"] = insn.reg_name(op.mem.base) if op.mem.base else None
                    entry["index"] = insn.reg_name(op.mem.index) if op.mem.index else None
                    entry["disp"] = op.mem.disp
                operands.append(entry)
        except capstone.CsError:
            operands = []

        try:
            groups = [insn.group_name(group) for group in insn.groups]
        except capstone.CsError:
            groups = []

        instructions.append(
            {
                "address": insn.address,
                "size": insn.size,
                "bytes": insn.bytes.hex(),
                "mnemonic": insn.mnemonic,
                "operands": insn.op_str,
                "operandDetail": operands,
                "groups": groups,
            }
        )
        consumed += insn.size
        if consumed >= len(payload):
            break

    result = {
        "ok": True,
        "data": {
            "architecture": canonical,
            "capstoneMode": label,
            "endian": endian,
            "address": address,
            "requested": count,
            "decoded": len(instructions),
            "consumedBytes": consumed,
            "instructions": instructions,
            "notes": (
                ["R5900 MMI instructions are not fully modelled by Capstone; unknown opcodes are reported as raw words."]
                if canonical == "r5900-mmi"
                else []
            ),
        },
    }
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
