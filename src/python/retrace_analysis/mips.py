"""MIPS analysis for Nintendo 64 (R4300i) and PlayStation 2 (R5900).

Two architectures, two ISAs, two ABIs. This module never treats them as
interchangeable: the caller must say which one it is looking at, and the result
reports which decoder settings produced it.

Decoding uses Capstone. Capstone does not model the R5900's COP2/VU0 macro
instructions, so those are reported as limitations rather than guessed.
"""

from __future__ import annotations

import base64
import binascii
import re
from typing import Any

from .errors import dependency_missing, invalid_params, unsupported
from .paths import looks_like_hex

try:  # pragma: no cover - exercised through the health probe
    import capstone
    from capstone import (
        CS_ARCH_MIPS,
        CS_MODE_BIG_ENDIAN,
        CS_MODE_LITTLE_ENDIAN,
        CS_MODE_MIPS64,
        Cs,
    )

    CAPSTONE_VERSION = getattr(capstone, "__version__", "unknown")
    HAVE_CAPSTONE = True
except Exception:  # pragma: no cover
    CAPSTONE_VERSION = None
    HAVE_CAPSTONE = False

ARCH_MODES = {
    # name: (mode, default endianness, note)
    "r4300i": (CS_MODE_MIPS64 | CS_MODE_BIG_ENDIAN, "big", "Nintendo 64 CPU, MIPS III, 64-bit GPRs"),
    "r5900": (CS_MODE_MIPS64 | CS_MODE_LITTLE_ENDIAN, "little", "PlayStation 2 Emotion Engine, MIPS III/IV + VU0"),
} if HAVE_CAPSTONE else {}

DELAY_SLOT_MNEMONICS = {
    "j", "jal", "jr", "jalr", "b", "bal",
    "beq", "bne", "beqz", "bnez", "beql", "bnel", "beqzl", "bnezl",
    "blez", "bgtz", "bltz", "bgez", "blezl", "bgtzl", "bltzl", "bgezl",
    "bltzal", "bgezal", "bltzall", "bgezall",
    "bc1t", "bc1f", "bc1tl", "bc1fl",
    "bc2t", "bc2f", "bc2tl", "bc2fl",
}

UNCONDITIONAL = {"j", "jal", "jr", "jalr", "b", "bal"}

BRANCH_MNEMONICS = {
    m for m in DELAY_SLOT_MNEMONICS
    if m not in {"j", "jal", "jr", "jalr", "b", "bal"}
}

MEMORY_MNEMONICS = {
    "lb", "lbu", "lh", "lhu", "lw", "lwu", "ld", "lwl", "lwr", "ldl", "ldr",
    "sb", "sh", "sw", "sd", "swl", "swr", "sdl", "sdr",
    "ll", "sc", "cache", "lwc1", "swc1", "ldc1", "sdc1", "lwc2", "swc2",
}

STACK_POINTER_NAMES = {"$sp", "sp", "$29"}

_MEM_OPERAND = re.compile(
    r"^(?P<offset>-?(?:0x[0-9a-fA-F]+|\d+))?\s*\(\s*(?P<base>\$?[a-zA-Z0-9]+)\s*\)$"
)
_IMMEDIATE = re.compile(r"^(?P<value>-?(?:0x[0-9a-fA-F]+|\d+))$")


def _require_capstone() -> None:
    if not HAVE_CAPSTONE:
        raise dependency_missing(
            "capstone is not installed in this Python environment",
            hint="pip install capstone",
        )


def engine(arch: str, endian: str | None = None) -> "Cs":
    _require_capstone()
    if arch not in ARCH_MODES:
        raise unsupported("arch must be 'r4300i' or 'r5900'", arch=arch)
    mode, default_endian, _ = ARCH_MODES[arch]
    chosen = (endian or default_endian).lower()
    if chosen not in {"big", "little"}:
        raise invalid_params("endian must be 'big' or 'little'", endian=endian)
    mode = mode & ~(CS_MODE_BIG_ENDIAN | CS_MODE_LITTLE_ENDIAN)
    mode |= CS_MODE_BIG_ENDIAN if chosen == "big" else CS_MODE_LITTLE_ENDIAN
    decoder = Cs(CS_ARCH_MIPS, mode)
    decoder.detail = True
    return decoder


def payload_bytes(params: dict[str, Any]) -> bytes:
    data_hex = params.get("data_hex")
    data_b64 = params.get("data_base64")
    if data_hex is not None:
        if not looks_like_hex(data_hex):
            raise invalid_params("data_hex must be an even-length hex string", field="data_hex")
        return bytes.fromhex(data_hex.strip().replace("0x", "").replace("_", "").replace(" ", ""))
    if data_b64 is not None:
        if not isinstance(data_b64, str):
            raise invalid_params("data_base64 must be a string", field="data_base64")
        try:
            return base64.b64decode(data_b64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise invalid_params("data_base64 is not valid base64", reason=str(exc)) from exc
    raise invalid_params("provide data_hex or data_base64")


def _int_param(params: dict[str, Any], name: str, default: int | None = None, *, minimum: int = 0) -> int:
    raw = params.get(name, default)
    if raw is None:
        raise invalid_params(f"{name} is required", field=name)
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise invalid_params(f"{name} must be an integer", field=name)
    if raw < minimum:
        raise invalid_params(f"{name} must be >= {minimum}", field=name, value=raw)
    return raw


def _limit(params: dict[str, Any]) -> int:
    count = _int_param(params, "count", 200, minimum=1)
    return min(count, 5000)


def _parse_immediate(text: str) -> int | None:
    match = _IMMEDIATE.match(text.strip())
    if not match:
        return None
    return int(match.group("value"), 0)


def instruction_dict(insn: Any) -> dict[str, Any]:
    return {
        "address": insn.address,
        "bytes": bytes(insn.bytes).hex(),
        "mnemonic": insn.mnemonic,
        "operands": insn.op_str,
        "text": f"{insn.mnemonic} {insn.op_str}".strip(),
    }


def disassemble(params: dict[str, Any]) -> dict[str, Any]:
    arch = str(params.get("arch", "")).strip().lower()
    data = payload_bytes(params)
    address = _int_param(params, "address", 0)
    count = _limit(params)
    stop_at_return = bool(params.get("stop_at_return", False))
    decoder = engine(arch, params.get("endian"))

    instructions: list[dict[str, Any]] = []
    consumed = 0
    for insn in decoder.disasm(data, address):
        instructions.append(instruction_dict(insn))
        consumed += insn.size
        if len(instructions) >= count:
            break
        if stop_at_return and insn.mnemonic == "jr" and insn.op_str.strip() in {"$ra", "ra"}:
            break

    result: dict[str, Any] = {
        "arch": arch,
        "endian": (params.get("endian") or ARCH_MODES[arch][1]),
        "address": address,
        "instructions": instructions,
        "instruction_count": len(instructions),
        "bytes_consumed": consumed,
        "bytes_provided": len(data),
        "decoder": {"engine": "capstone", "version": CAPSTONE_VERSION, "mode": ARCH_MODES[arch][0]},
        "confidence": "confirmed" if instructions else "insufficient",
        "evidence": {"source": "caller-provided bytes", "tool": "capstone"},
        "limitations": limitations_for(arch),
    }
    if not instructions:
        result["limitations"] = result["limitations"] + [
            "No instruction decoded from the provided bytes with these settings."
        ]
    return result


def limitations_for(arch: str) -> list[str]:
    common = [
        "Decoding is static; delay-slot behaviour is annotated, not executed.",
        "Capstone's MIPS64 mode approximates MIPS III (R4300i); not every ISA corner is modelled.",
    ]
    if arch == "r5900":
        common.append(
            "R5900 COP2/VU0 macro instructions are not modelled by Capstone; "
            "they may decode as invalid or generic COP2."
        )
        common.append("PS2 EE code is little-endian and uses the o32/n32-ish EE ABI, not the N64 ABI.")
    elif arch == "r4300i":
        common.append("N64 code is big-endian and uses the o32 ABI (a0-a3 arguments, v0/v1 return).")
    return common


def _mem_access(insn: Any) -> dict[str, Any] | None:
    if insn.mnemonic not in MEMORY_MNEMONICS:
        return None
    operands = [part.strip() for part in insn.op_str.split(",")]
    for operand in operands:
        match = _MEM_OPERAND.match(operand)
        if match:
            offset = int(match.group("offset"), 0) if match.group("offset") else 0
            return {
                "mnemonic": insn.mnemonic,
                "offset": offset,
                "base_register": match.group("base"),
                "operand": operand,
                "address": insn.address,
            }
    return None


def _prologue(instructions: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not instructions:
        return None
    first = instructions[0]
    if first["mnemonic"] not in {"addiu", "daddiu", "addi", "daddi"}:
        return None
    operands = [part.strip() for part in first["operands"].split(",")]
    if len(operands) != 3:
        return None
    dest, src, amount = operands
    if dest not in STACK_POINTER_NAMES or src not in STACK_POINTER_NAMES:
        return None
    delta = _parse_immediate(amount)
    if delta is None or delta >= 0:
        return None
    saves_ra = any(
        insn["mnemonic"] in {"sw", "sd"}
        and "$ra" in insn["operands"]
        and "($sp)" in insn["operands"].replace(" ", "")
        for insn in instructions[1:5]
    )
    return {
        "frame_size": -delta,
        "saves_ra": saves_ra,
        "address": first["address"],
        "evidence": "addiu $sp,$sp,-N prologue" + (" with a saved $ra" if saves_ra else ""),
    }


def analyze_function(params: dict[str, Any]) -> dict[str, Any]:
    arch = str(params.get("arch", "")).strip().lower()
    data = payload_bytes(params)
    address = _int_param(params, "address", 0)
    maximum = min(_int_param(params, "max_instructions", 500, minimum=1), 5000)
    decoder = engine(arch, params.get("endian"))

    instructions: list[dict[str, Any]] = []
    delay_slot_indexes: set[int] = set()
    calls: list[dict[str, Any]] = []
    branches: list[dict[str, Any]] = []
    returns: list[dict[str, Any]] = []
    memory_accesses: list[dict[str, Any]] = []
    ended_on_return = False

    for insn in decoder.disasm(data, address):
        if len(instructions) >= maximum:
            break
        index = len(instructions)
        entry = instruction_dict(insn)
        if index in delay_slot_indexes:
            entry["is_delay_slot"] = True
        instructions.append(entry)

        mnemonic = insn.mnemonic
        operands = [part.strip() for part in insn.op_str.split(",")]

        if index + 1 < maximum:
            delay_slot_indexes.add(index + 1)

        if mnemonic in {"jal", "jalr"}:
            target = _parse_immediate(operands[-1]) if operands else None
            calls.append({
                "address": insn.address,
                "instruction": entry["text"],
                "kind": "direct" if mnemonic == "jal" else "indirect",
                "target": target,
                "target_register": operands[-1] if mnemonic == "jalr" and operands else None,
            })
        elif mnemonic in UNCONDITIONAL:
            target = _parse_immediate(operands[-1]) if operands else None
            branches.append({
                "address": insn.address,
                "instruction": entry["text"],
                "kind": "jump",
                "target": target,
                "unconditional": True,
            })
        elif mnemonic in BRANCH_MNEMONICS:
            target = _parse_immediate(operands[-1]) if operands else None
            branches.append({
                "address": insn.address,
                "instruction": entry["text"],
                "kind": "conditional_branch",
                "target": target,
                "unconditional": False,
            })

        if mnemonic == "jr" and insn.op_str.strip() in {"$ra", "ra"}:
            returns.append({"address": insn.address, "instruction": entry["text"]})
            ended_on_return = True
            if arch and params.get("stop_at_return", True):
                break
        elif mnemonic != "jr":
            ended_on_return = False

        access = _mem_access(insn)
        if access:
            memory_accesses.append(access)

    end_address = (instructions[-1]["address"] + 4) if instructions else address
    prologue = _prologue(instructions)
    if ended_on_return and prologue:
        confidence = "confirmed"
    elif ended_on_return:
        confidence = "very_likely"
    elif instructions:
        confidence = "possible"
    else:
        confidence = "insufficient"

    return {
        "arch": arch,
        "endian": (params.get("endian") or ARCH_MODES[arch][1]),
        "start": address,
        "end": end_address,
        "estimated_size": end_address - address,
        "instruction_count": len(instructions),
        "instructions": instructions,
        "basic_blocks": basic_blocks(instructions, branches),
        "calls": calls,
        "branches": branches,
        "returns": returns,
        "memory_accesses": memory_accesses,
        "prologue": prologue,
        "confidence": confidence,
        "evidence": {"source": "caller-provided bytes", "tool": "capstone"},
        "limitations": limitations_for(arch) + [
            "Function boundaries are inferred from control flow, not from symbols or DWARF.",
            "Registers are not tracked through instructions in this pass.",
        ],
    }


def basic_blocks(instructions: list[dict[str, Any]], branches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not instructions:
        return []
    by_address = {insn["address"]: index for index, insn in enumerate(instructions)}
    leaders = {0}
    for branch in branches:
        target = branch.get("target")
        if isinstance(target, int) and target in by_address:
            leaders.add(by_address[target])
    for index, insn in enumerate(instructions):
        if insn["mnemonic"] in DELAY_SLOT_MNEMONICS:
            # The instruction after the delay slot starts a new block.
            after = index + 2
            if after < len(instructions):
                leaders.add(after)
    ordered = sorted(leaders)
    blocks: list[dict[str, Any]] = []
    for position, start in enumerate(ordered):
        end = ordered[position + 1] if position + 1 < len(ordered) else len(instructions)
        chunk = instructions[start:end]
        if not chunk:
            continue
        blocks.append({
            "start": chunk[0]["address"],
            "end": chunk[-1]["address"] + 4,
            "instruction_count": len(chunk),
        })
    return blocks
