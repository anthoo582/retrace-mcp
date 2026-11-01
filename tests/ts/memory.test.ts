import { describe, it, expect } from "vitest";
import {
  n64MemoryMap,
  ps2MemoryMap,
  lookupRegion,
  inspectPointer,
  detectOverlaps,
  parseRegisterDump,
  resolveCrashContext
} from "../../src/memory/forensics.js";

describe("memory / forensics", () => {
  it("provides distinct N64 and PS2 memory maps", () => {
    const n64 = n64MemoryMap();
    const ps2 = ps2MemoryMap();

    const n64Rdram = lookupRegion(0x80000400, n64);
    expect(n64Rdram.inRegion).toBe(true);
    expect(n64Rdram.region).toBe("RDRAM");

    const ps2Ram = lookupRegion(0x00100000, ps2);
    expect(ps2Ram.inRegion).toBe(true);
    expect(ps2Ram.region).toBe("EE main RAM");

    const ps2Gs = lookupRegion(0x12000000, ps2);
    expect(ps2Gs.inRegion).toBe(true);
    expect(ps2Gs.region).toBe("GS registers");
  });

  it("inspects pointers for alignment and validity", () => {
    const n64 = n64MemoryMap();
    const validPtr = inspectPointer(0x80000400, n64);
    expect(validPtr.aligned4).toBe(true);
    expect(validPtr.null).toBe(false);

    const misaligned = inspectPointer(0x80000401, n64);
    expect(misaligned.aligned4).toBe(false);

    const nullPtr = inspectPointer(0x00000000, n64);
    expect(nullPtr.null).toBe(true);
  });

  it("detects memory region overlaps", () => {
    const regions = [
      { name: "TextureBuffer", start: 0x00100000, end: 0x00200000 },
      { name: "AudioHeap", start: 0x00180000, end: 0x00280000 }
    ];
    const overlaps = detectOverlaps(regions);
    expect(overlaps.length).toBe(1);
    expect(overlaps[0]!.overlapBytes).toBe(0x80001);
  });

  it("parses register dumps and resolves crash contexts", () => {
    const log = `
      epc: 0x00100400
      ra: 0x00100480
      sp: 0x01ffffe0
      badvaddr: 0x00000004
      v0: 0x00000000
      a0: 0x00100000
    `;
    const dump = parseRegisterDump(log);
    expect(dump.registers["epc"]).toBe(0x00100400);
    expect(dump.registers["badvaddr"]).toBe(0x00000004);

    const ps2 = ps2MemoryMap();
    const crash = resolveCrashContext(dump.registers, {
      map: ps2,
      badAddress: 0x00000004
    });
    expect(crash.architecture).toBe("ps2");
    expect(crash.pointerVerdicts.some((p) => p.value === 0x00000004 || p.null)).toBe(true);
  });
});
