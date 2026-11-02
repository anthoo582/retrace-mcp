import { describe, expect, it } from "vitest";
import { N64Rom } from "../../src/parsers/n64rom.js";

function fixtureRom(): Buffer {
  const rom = Buffer.alloc(0x1000, 0);
  rom.writeUInt32BE(0x80371240, 0);
  rom.write("TEST ROM", 0x20, "ascii");
  rom.write("AB", 0x3b, "ascii");
  rom[0x3e] = 0x45;
  rom[0x3f] = 1;
  return rom;
}

describe("intake primitives", () => {
  it("validates a native N64 header without changing bytes", () => {
    const bytes = fixtureRom();
    const before = Buffer.from(bytes);
    const rom = N64Rom.fromBuffer(bytes);
    expect(rom.format.byteOrder).toBe("big-endian");
    expect(rom.header.romName).toBe("TEST ROM");
    expect(bytes.equals(before)).toBe(true);
  });

  it("does not pretend a short or invalid input is a ROM", () => {
    expect(() => N64Rom.fromBuffer(Buffer.alloc(3))).toThrow();
    expect(() => N64Rom.fromBuffer(Buffer.alloc(0x40))).toThrow(/Unrecognized N64 ROM magic/);
  });
});
