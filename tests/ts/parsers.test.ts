import { describe, it, expect } from "vitest";
import {
  detectRomFormat,
  normalizeToBigEndian,
  parseHeader
} from "../../src/parsers/n64rom.js";
import { ElfFile } from "../../src/parsers/elf.js";
import { parseSymbolText, compareSymbolTables, symbolAt } from "../../src/parsers/symbols.js";

describe("parsers / n64rom", () => {
  it("detects big-endian .z64 ROM format", () => {
    const header = Buffer.alloc(0x40);
    header.writeUInt32BE(0x80371240, 0); // .z64 magic
    header.writeUInt32BE(0x80000400, 8); // entry point
    header.write("MARIOKART64", 0x20, "ascii");

    const format = detectRomFormat(header);
    expect(format.byteOrder).toBe("big-endian");
    expect(format.extensionHint).toBe(".z64");

    const parsed = parseHeader(header);
    expect(parsed.entryPoint).toBe(0x80000400);
    expect(parsed.romName.trim()).toBe("MARIOKART64");
  });

  it("detects byte-swapped .v64 ROM format and normalizes to big-endian", () => {
    const swapped = Buffer.alloc(0x40);
    swapped.writeUInt32BE(0x37804012, 0); // .v64 magic
    const format = detectRomFormat(swapped);
    expect(format.byteOrder).toBe("byteswapped");
    expect(format.extensionHint).toBe(".v64");

    const normalized = normalizeToBigEndian(swapped, format.byteOrder);
    expect(normalized.readUInt32BE(0)).toBe(0x80371240);
  });

  it("detects little-endian .n64 ROM format and normalizes to big-endian", () => {
    const le = Buffer.alloc(0x40);
    le.writeUInt32BE(0x40123780, 0); // .n64 magic
    const format = detectRomFormat(le);
    expect(format.byteOrder).toBe("little-endian");
    expect(format.extensionHint).toBe(".n64");

    const normalized = normalizeToBigEndian(le, format.byteOrder);
    expect(normalized.readUInt32BE(0)).toBe(0x80371240);
  });
});

describe("parsers / symbols", () => {
  it("parses symbol map / symbol text definitions", () => {
    const sample = `
      # Symbol table
      main = 0x80000400;
      update_physics = 0x80001000;
      gPlayerKart = 0x80050000;
    `;
    const table = parseSymbolText(sample, "sample.map");
    expect(table.symbols.length).toBe(3);

    const mainSym = symbolAt(table, 0x80000400);
    expect(mainSym).toBeDefined();
    expect(mainSym?.name).toBe("main");
  });

  it("compares two symbol tables and reports additions, removals, and changes", () => {
    const a = parseSymbolText("func_a = 0x80001000;\nfunc_b = 0x80002000;", "a.map");
    const b = parseSymbolText("func_a = 0x80001000;\nfunc_b = 0x80002020;\nfunc_c = 0x80003000;", "b.map");

    const diff = compareSymbolTables(a, b);
    expect(diff.onlyInB.map((s) => s.name)).toContain("func_c");
    expect(diff.moved.some((c) => c.name === "func_b")).toBe(true);
    expect(diff.onlyInA.length).toBe(0);
  });
});

describe("parsers / ELF validation", () => {
  it("requires the complete ELF64 header instead of parsing it as ELF32", () => {
    const truncated = Buffer.alloc(52);
    truncated.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);

    expect(() => ElfFile.fromBuffer(truncated)).toThrow(/ELF64 header/);
  });

  it("rejects unknown ELF class and data encoding values", () => {
    const invalidClass = Buffer.alloc(16);
    invalidClass.set([0x7f, 0x45, 0x4c, 0x46, 3, 1, 1], 0);
    const invalidData = Buffer.alloc(16);
    invalidData.set([0x7f, 0x45, 0x4c, 0x46, 1, 3, 1], 0);

    expect(() => ElfFile.fromBuffer(invalidClass)).toThrow(/Unsupported ELF class/);
    expect(() => ElfFile.fromBuffer(invalidData)).toThrow(/Unsupported ELF data/);
  });

  it("rejects section tables that extend past the input file", () => {
    const truncated = Buffer.alloc(52);
    truncated.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0);
    truncated.writeUInt16LE(52, 40); // e_ehsize
    truncated.writeUInt32LE(52, 32); // e_shoff
    truncated.writeUInt16LE(40, 46); // e_shentsize
    truncated.writeUInt16LE(1, 48); // e_shnum

    expect(() => ElfFile.fromBuffer(truncated)).toThrow(/section-header table/);
  });
});
