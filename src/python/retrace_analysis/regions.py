"""Documented memory maps for Nintendo 64 (R4300i) and PlayStation 2 (R5900 EE).

Only widely documented regions are listed. Anything else is reported as unknown
instead of being guessed. `confidence` describes the mapping, not the data.
"""

from __future__ import annotations

from typing import Any

from .errors import invalid_params

ARCHES = {"r4300i", "r5900"}

N64_REGIONS: list[dict[str, Any]] = [
    {"name": "RDRAM (KUSEG mirror)", "start": 0x00000000, "end": 0x007FFFFF,
     "notes": "4 MiB console; 8 MiB with Expansion Pak. Mirrored through KSEG0/KSEG1."},
    {"name": "KSEG0 (cached)", "start": 0x80000000, "end": 0x9FFFFFFF, "notes": "Direct-mapped cached view of RDRAM."},
    {"name": "KSEG1 (uncached)", "start": 0xA0000000, "end": 0xA3FFFFFF, "notes": "Uncached RDRAM window."},
    {"name": "SP DMEM", "start": 0xA4000000, "end": 0xA4000FFF, "notes": "RSP data memory, 4 KiB."},
    {"name": "SP IMEM", "start": 0xA4001000, "end": 0xA4001FFF, "notes": "RSP instruction memory, 4 KiB."},
    {"name": "SP registers", "start": 0xA4040000, "end": 0xA404001F, "notes": "RSP status/half/semaphore registers."},
    {"name": "DPC (RDP command interface)", "start": 0xA4100000, "end": 0xA410000F, "notes": "RDP start/end/status/clock."},
    {"name": "DPS (RDP span/pipe)", "start": 0xA4200000, "end": 0xA420000F, "notes": "RDP span and pipe busy registers."},
    {"name": "MI", "start": 0xA4300000, "end": 0xA430000F, "notes": "MIPS interface registers."},
    {"name": "VI", "start": 0xA4400000, "end": 0xA440003F, "notes": "Video interface."},
    {"name": "AI", "start": 0xA4500000, "end": 0xA4500017, "notes": "Audio interface."},
    {"name": "PI", "start": 0xA4600000, "end": 0xA4600013, "notes": "Peripheral interface."},
    {"name": "RI", "start": 0xA4700000, "end": 0xA470000F, "notes": "RDRAM interface."},
    {"name": "SI", "start": 0xA4800000, "end": 0xA4800017, "notes": "Serial interface."},
    {"name": "PIF boot ROM", "start": 0xBFC00000, "end": 0xBFC007BF, "notes": "PIF ROM, also visible at 0x9FC00000."},
]

PS2_REGIONS: list[dict[str, Any]] = [
    {"name": "EE main RAM", "start": 0x00000000, "end": 0x01FFFFFF, "notes": "32 MiB RDRAM."},
    {"name": "EE scratchpad", "start": 0x10000000, "end": 0x10003FFF, "notes": "16 KiB SPRAM, not cached transparently."},
    {"name": "VU0 data memory", "start": 0x11000000, "end": 0x11000FFF, "notes": "4 KiB."},
    {"name": "VU0 micro memory", "start": 0x11004000, "end": 0x11004FFF, "notes": "4 KiB microcode."},
    {"name": "VU1 data memory", "start": 0x11008000, "end": 0x1100BFFF, "notes": "16 KiB."},
    {"name": "VU1 micro memory", "start": 0x1100C000, "end": 0x1100FFFF, "notes": "16 KiB microcode."},
    {"name": "GS registers", "start": 0x12000000, "end": 0x12000FFF, "notes": "Graphics Synthesizer privileged registers."},
    {"name": "IOP RAM", "start": 0x1C000000, "end": 0x1C1FFFFF, "notes": "2 MiB IOP memory."},
    {"name": "EE boot ROM", "start": 0xBFC00000, "end": 0xBFFFFFFF, "notes": "4 MiB boot ROM, mirrored at 0x9FC00000."},
]

REGION_TABLE = {"r4300i": N64_REGIONS, "r5900": PS2_REGIONS}

ALIGNMENT_BYTES = (2, 4, 8, 16, 32, 64, 128, 256)


def normalize_arch(value: object) -> str:
    if not isinstance(value, str):
        raise invalid_params("arch must be a string", arch=value)
    arch = value.strip().lower()
    if arch not in ARCHES:
        raise invalid_params("arch must be 'r4300i' or 'r5900'", arch=value)
    return arch


def classify_address(arch: str, address: int) -> dict[str, Any]:
    arch = normalize_arch(arch)
    if address < 0 or address > 0xFFFFFFFFFFFFFFFF:
        raise invalid_params("address out of range", address=address)
    for region in REGION_TABLE[arch]:
        if region["start"] <= address <= region["end"]:
            offset = address - region["start"]
            return {
                "arch": arch,
                "address": address,
                "region": region["name"],
                "region_start": region["start"],
                "region_end": region["end"],
                "offset_in_region": offset,
                "size": region["end"] - region["start"] + 1,
                "notes": region["notes"],
                "confidence": "confirmed",
                "evidence": {"source": "Documented memory map", "tool": "builtin"},
            }
    return {
        "arch": arch,
        "address": address,
        "region": "unknown",
        "notes": "Not in any documented region of this architecture. Not necessarily invalid: coverage is partial by design.",
        "confidence": "insufficient",
        "limitations": [
            "Only documented regions are listed; unmapped is not the same as invalid."
        ],
        "evidence": {"source": "Documented memory map", "tool": "builtin"},
    }


def alignment_report(address: int) -> dict[str, Any]:
    aligned = [size for size in ALIGNMENT_BYTES if address % size == 0]
    return {
        "largest_alignment_bytes": aligned[-1] if aligned else 1,
        "aligned_to_2": 2 in aligned,
        "aligned_to_4": 4 in aligned,
        "aligned_to_8": 8 in aligned,
        "aligned_to_16": 16 in aligned,
        "aligned_to_32": 32 in aligned,
        "aligned_to_64": 64 in aligned,
    }
