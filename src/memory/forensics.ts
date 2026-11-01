import { ElfFile } from "../parsers/elf.js";
import { SymbolTable, symbolAt } from "../parsers/symbols.js";

export type RegisterDump = {
  registers: Record<string, number>;
  raw: string;
  warnings: string[];
};

const REGISTER_ALIASES: Record<string, string> = {
  pc: "pc",
  epc: "epc",
  ra: "ra",
  sp: "sp",
  gp: "gp",
  hi: "hi",
  lo: "lo",
  cause: "cause",
  status: "status",
  badvaddr: "badvaddr",
  baddr: "badvaddr",
  a0: "a0",
  a1: "a1",
  a2: "a2",
  a3: "a3",
  v0: "v0",
  v1: "v1",
  at: "at",
  zero: "zero"
};

function normalizeRegisterName(raw: string): string {
  const cleaned = raw.trim().replace(/^[$%]/, "").toLowerCase();
  const alias = REGISTER_ALIASES[cleaned];
  if (alias) return alias;
  if (/^[tsk]\d$/.test(cleaned) || /^f\d+$/.test(cleaned) || /^v[f0-9]+$/.test(cleaned) || /^vi\d+$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

function parseValue(raw: string): number | null {
  const cleaned = raw.trim().replace(/[,;]$/, "");
  if (!cleaned) return null;
  if (/^0x[0-9a-f]+$/i.test(cleaned)) {
    const value = Number.parseInt(cleaned.slice(2), 16);
    return Number.isFinite(value) ? value : null;
  }
  if (/^[0-9a-f]{8}$/i.test(cleaned)) return Number.parseInt(cleaned, 16);
  if (/^\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10);
  if (/^-0x[0-9a-f]+$/i.test(cleaned)) return -Number.parseInt(cleaned.slice(3), 16);
  return null;
}

export function parseRegisterDump(text: string): RegisterDump {
  const registers: Record<string, number> = {};
  const warnings: string[] = [];

  const pairPattern = /([A-Za-z][A-Za-z0-9_]*)\s*[:=]\s*(-?0x[0-9a-fA-F]+|-?\d+)/g;
  for (const match of text.matchAll(pairPattern)) {
    const name = normalizeRegisterName(match[1]!);
    const value = parseValue(match[2]!);
    if (value === null) continue;
    registers[name] = value >>> 0;
  }

  const tablePattern = /\b([tskav]\d{1,2}|at|ra|sp|gp|pc|hi|lo|epc)\b[ \t]+([0-9a-fA-F]{8})\b/g;
  for (const match of text.matchAll(tablePattern)) {
    const name = normalizeRegisterName(match[1]!);
    if (registers[name] === undefined) {
      const value = parseValue(match[2]!);
      if (value !== null) registers[name] = value >>> 0;
    }
  }

  if (Object.keys(registers).length === 0) {
    warnings.push("No registers recognized. Supported forms: `pc=0x80010000`, `PC 80010000`, `$ra: 0x...`.");
  }
  return { registers, raw: text, warnings };
}

export type MemoryRegion = {
  name: string;
  start: number;
  end: number;
  kind: "code" | "data" | "stack" | "heap" | "ram" | "vram" | "io" | "unknown";
};

export type RegionSet = {
  regions: MemoryRegion[];
  architecture: "n64" | "ps2" | "unknown";
};

export function n64MemoryMap(): RegionSet {
  return {
    architecture: "n64",
    regions: [
      { name: "RDRAM", start: 0x80000000, end: 0x803fffff, kind: "ram" },
      { name: "RDRAM (expanded)", start: 0x80400000, end: 0x807fffff, kind: "ram" },
      { name: "SP DMEM", start: 0xa4000000, end: 0xa4000fff, kind: "ram" },
      { name: "SP IMEM", start: 0xa4001000, end: 0xa4001fff, kind: "code" },
      { name: "SP registers", start: 0xa4040000, end: 0xa4041fff, kind: "io" },
      { name: "DP command", start: 0xa4100000, end: 0xa41fffff, kind: "io" },
      { name: "MI", start: 0xa4300000, end: 0xa430000f, kind: "io" },
      { name: "VI", start: 0xa4400000, end: 0xa443ffff, kind: "io" },
      { name: "AI", start: 0xa4500000, end: 0xa450000f, kind: "io" },
      { name: "PI", start: 0xa4600000, end: 0xa460003f, kind: "io" },
      { name: "RI", start: 0xa4700000, end: 0xa470001f, kind: "io" },
      { name: "SI", start: 0xa4800000, end: 0xa4800017, kind: "io" },
      { name: "PIF", start: 0xb0000000, end: 0xb00007bf, kind: "io" },
      { name: "Cartridge ROM", start: 0xb0000000, end: 0xbfffffff, kind: "code" },
      { name: "KSEG0 direct", start: 0x80000000, end: 0x9fffffff, kind: "ram" }
    ]
  };
}

export function ps2MemoryMap(): RegionSet {
  return {
    architecture: "ps2",
    regions: [
      { name: "EE main RAM", start: 0x00000000, end: 0x01ffffff, kind: "ram" },
      { name: "EE main RAM (mirror)", start: 0x20000000, end: 0x21ffffff, kind: "ram" },
      { name: "VU0 micro memory", start: 0x11000000, end: 0x11003fff, kind: "ram" },
      { name: "VU0 data memory", start: 0x11004000, end: 0x11007fff, kind: "ram" },
      { name: "VU1 micro memory", start: 0x11008000, end: 0x1100bfff, kind: "ram" },
      { name: "VU1 data memory", start: 0x1100c000, end: 0x1100ffff, kind: "ram" },
      { name: "Scratchpad", start: 0x70000000, end: 0x70003fff, kind: "ram" },
      { name: "EE registers", start: 0x10000000, end: 0x1000ffff, kind: "io" },
      { name: "VU0 registers", start: 0x10003800, end: 0x10003fff, kind: "io" },
      { name: "VU1 registers", start: 0x10005000, end: 0x10005fff, kind: "io" },
      { name: "GS registers", start: 0x12000000, end: 0x12000fff, kind: "io" },
      { name: "GS VRAM", start: 0x00000000, end: 0x03ffffff, kind: "vram" },
      { name: "IOP RAM", start: 0x1c000000, end: 0x1c1fffff, kind: "ram" },
      { name: "IOP registers", start: 0x1f801000, end: 0x1f803fff, kind: "io" },
      { name: "KSEG0 cached", start: 0x80000000, end: 0x9fffffff, kind: "ram" },
      { name: "KSEG1 uncached", start: 0xa0000000, end: 0xbfffffff, kind: "ram" }
    ]
  };
}

export type RegionLookup = {
  address: number;
  inRegion: boolean;
  region?: string;
  kind?: string;
  offsetInRegion?: number;
};

export function lookupRegion(address: number, map: RegionSet): RegionLookup {
  const unsigned = address >>> 0;
  for (const region of map.regions) {
    if (unsigned >= region.start && unsigned <= region.end) {
      return {
        address: unsigned,
        inRegion: true,
        region: region.name,
        kind: region.kind,
        offsetInRegion: unsigned - region.start
      };
    }
  }
  return { address: unsigned, inRegion: false };
}

export type PointerVerdict = {
  value: number;
  null: boolean;
  aligned4: boolean;
  mapped: boolean;
  region?: string;
  kind?: string;
  symbol?: string;
  issues: string[];
  confidence: "confirmed" | "possible" | "insufficient";
};

export function inspectPointer(value: number, map: RegionSet, symbols?: SymbolTable): PointerVerdict {
  const unsigned = value >>> 0;
  const location = lookupRegion(unsigned, map);
  const issues: string[] = [];
  const isNull = unsigned === 0;
  const aligned = (unsigned & 0x3) === 0;
  if (isNull) issues.push("Null pointer (0x00000000)");
  if (!aligned) issues.push("Misaligned: low two bits are not zero");
  if (!location.inRegion) issues.push("Outside every known memory region for this architecture");
  if (unsigned < 0x1000 && !isNull) issues.push("Low address, likely an offset used as a pointer");
  const symbol = symbols ? symbolAt(symbols, unsigned) : undefined;
  let confidence: PointerVerdict["confidence"] = "possible";
  if (isNull || !location.inRegion || !aligned) confidence = "confirmed";
  else if (symbol) confidence = "confirmed";
  else if (location.inRegion) confidence = "possible";
  else confidence = "insufficient";
  return {
    value: unsigned,
    null: isNull,
    aligned4: aligned,
    mapped: location.inRegion,
    region: location.region,
    kind: location.kind,
    symbol: symbol?.name,
    issues,
    confidence
  };
}

export type MemoryHit = {
  offset: number;
  address: number;
  value: number;
};

export function scanForPointer(
  buffer: Buffer,
  baseAddress: number,
  needle: number,
  options: { endian?: "little" | "big"; alignment?: number; limit?: number } = {}
): MemoryHit[] {
  const endian = options.endian ?? "little";
  const alignment = Math.max(1, options.alignment ?? 4);
  const limit = options.limit ?? 1000;
  const target = needle >>> 0;
  const hits: MemoryHit[] = [];
  for (let offset = 0; offset + 3 < buffer.length; offset += alignment) {
    const value = endian === "little" ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
    if (value === target) {
      hits.push({ offset, address: (baseAddress + offset) >>> 0, value });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

export type OverlapReport = {
  regionA: string;
  regionB: string;
  overlapStart: number;
  overlapBytes: number;
};

export function detectOverlaps(regions: Array<{ name: string; start: number; end: number }>): OverlapReport[] {
  const overlaps: OverlapReport[] = [];
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (b.start > a.end) break;
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      if (start <= end) {
        overlaps.push({ regionA: a.name, regionB: b.name, overlapStart: start, overlapBytes: end - start + 1 });
      }
    }
  }
  return overlaps;
}

export type CrashContext = {
  architecture: "n64" | "ps2" | "unknown";
  registers: Record<string, number>;
  pc?: { address: number; symbol?: string; section?: string; offset?: number };
  ra?: { address: number; symbol?: string };
  sp?: { address: number; region?: string };
  faultyInstruction?: { address: number; text?: string; error?: string };
  stackWords: Array<{ address: number; value: number; symbol?: string; plausibleReturn: boolean }>;
  pointerVerdicts: Array<PointerVerdict>;
  hypotheses: Array<{ claim: string; evidence: string[]; confidence: "confirmed" | "very_likely" | "possible" | "insufficient" }>;
  warnings: string[];
};

export function resolveCrashContext(
  registers: Record<string, number>,
  options: {
    map: RegionSet;
    elf?: ElfFile;
    symbols?: SymbolTable;
    stackWords?: Array<{ address: number; value: number }>;
    badAddress?: number;
    cause?: number;
  }
): CrashContext {
  const { map, elf, symbols } = options;
  const warnings: string[] = [];
  const pc = registers.pc !== undefined ? registers.pc >>> 0 : undefined;
  const ra = registers.ra !== undefined ? registers.ra >>> 0 : undefined;
  const sp = registers.sp !== undefined ? registers.sp >>> 0 : undefined;

  const resolveSymbol = (address: number): string | undefined => {
    if (elf) {
      const symbol = elf.symbolAt(address);
      if (symbol) return symbol.name || `sub_${address.toString(16)}`;
      const section = elf.sectionAt(address);
      if (section) return `${section.name}+0x${(address - section.addr).toString(16)}`;
    }
    return symbols ? symbolAt(symbols, address)?.name : undefined;
  };

  const pcInfo = pc === undefined ? undefined : {
    address: pc,
    symbol: resolveSymbol(pc),
    section: elf?.sectionAt(pc)?.name,
    offset: elf?.sectionAt(pc) ? pc - (elf.sectionAt(pc)?.addr ?? 0) : undefined
  };
  const raInfo = ra === undefined ? undefined : { address: ra, symbol: resolveSymbol(ra) };
  const spInfo = sp === undefined ? undefined : { address: sp, region: lookupRegion(sp, map).region };

  const pointerValues = Object.entries(registers)
    .filter(([name]) => name !== "zero" && name !== "status" && name !== "cause")
    .map(([, value]) => value);
  const pointerVerdicts = pointerValues.map((value) => inspectPointer(value, map, symbols));
  const suspicious = pointerVerdicts.filter((verdict) => !verdict.null && verdict.issues.length > 0);

  const stackWords = (options.stackWords ?? []).map((entry) => {
    const plausible = entry.value >= map.regions[0]!.start && entry.value <= 0xffffffff;
    return {
      address: entry.address >>> 0,
      value: entry.value >>> 0,
      symbol: resolveSymbol(entry.value),
      plausibleReturn: plausible
    };
  });

  const hypotheses: CrashContext["hypotheses"] = [];
  if (pc !== undefined) {
    const pcRegion = lookupRegion(pc, map);
    if (!pcRegion.inRegion) {
      hypotheses.push({
        claim: "Program counter points outside any mapped region",
        evidence: [`pc=0x${pc.toString(16)} is not inside the ${map.architecture} memory map`],
        confidence: "confirmed"
      });
    } else if (pcRegion.kind === "ram" && elf) {
      const section = elf.sectionAt(pc);
      if (!section) {
        hypotheses.push({
          claim: "Execution jumped into RAM outside any executable ELF section",
          evidence: [`pc=0x${pc.toString(16)} resolves to ${pcRegion.region} but no ELF section covers it`],
          confidence: "very_likely"
        });
      }
    }
  }
  if (options.badAddress !== undefined) {
    const bad = options.badAddress >>> 0;
    const badRegion = lookupRegion(bad, map);
    hypotheses.push({
      claim: badRegion.inRegion ? "Faulting access targeted a mapped region (alignment or protection issue)" : "Faulting access targeted an unmapped address",
      evidence: [`BadVaddr=0x${bad.toString(16)} -> ${badRegion.region ?? "unmapped"}`],
      confidence: "confirmed"
    });
  }
  if (suspicious.length > 0) {
    hypotheses.push({
      claim: "One or more general-purpose registers hold implausible addresses",
      evidence: suspicious.slice(0, 5).map((verdict) => `0x${verdict.value.toString(16)}: ${verdict.issues.join("; ")}`),
      confidence: "possible"
    });
  }
  if (registers.cause !== undefined) {
    const cause = registers.cause >>> 0;
    const excCode = (cause >> 2) & 0x1f;
    const causeNames: Record<number, string> = {
      0: "Interrupt",
      4: "Address error on load",
      5: "Address error on store",
      6: "Bus error on instruction fetch",
      7: "Bus error on data",
      8: "System call",
      9: "Breakpoint",
      10: "Reserved instruction",
      11: "Coprocessor unusable",
      12: "Arithmetic overflow",
      13: "Trap"
    };
    hypotheses.push({
      claim: `Exception code ${excCode}: ${causeNames[excCode] ?? "unknown"}`,
      evidence: [`Cause=0x${cause.toString(16)}`],
      confidence: "very_likely"
    });
  }
  if (hypotheses.length === 0) warnings.push("Not enough evidence for a confident hypothesis; supply BadVaddr/Cause, a stack dump and matching symbols.");

  return {
    architecture: map.architecture,
    registers,
    pc: pcInfo,
    ra: raInfo,
    sp: spInfo,
    stackWords,
    pointerVerdicts,
    hypotheses,
    warnings
  };
}

export function parseMemoryRegionsText(text: string): Array<{ name: string; start: number; end: number }> {
  const regions: Array<{ name: string; start: number; end: number }> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_.\-/ ]+?)\s*[:=]?\s+(0x[0-9a-f]+)\s*[-:]\s*(0x[0-9a-f]+)/i.exec(line);
    if (!match) continue;
    const start = Number.parseInt(match[2]!.slice(2), 16);
    const end = Number.parseInt(match[3]!.slice(2), 16);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      regions.push({ name: match[1]!.trim(), start, end });
    }
  }
  return regions;
}
