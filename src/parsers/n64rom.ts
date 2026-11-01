import { readFileCapped } from "../security/paths.js";

export type RomByteOrder = "big-endian" | "byteswapped" | "little-endian";

export type RomFormat = {
  byteOrder: RomByteOrder;
  extensionHint: string;
  magic: string;
  description: string;
};

export type RomHeader = {
  romName: string;
  clockRate: number;
  entryPoint: number;
  release: number;
  crc1: number;
  crc2: number;
  manufacturer: string;
  cartId: string;
  countryCode: number;
  countryName: string;
  version: number;
};

export type RomChecksumResult = {
  computedCrc1: number;
  computedCrc2: number;
  storedCrc1: number;
  storedCrc2: number;
  matches: boolean;
  note: string;
};

export type CodeRegion = {
  start: number;
  end: number;
  size: number;
  prologues: number;
  jalTargets: number;
};

const COUNTRIES: Record<number, string> = {
  0x00: "Demo",
  0x37: "Beta",
  0x41: "Asia (NTSC)",
  0x44: "Germany",
  0x45: "USA",
  0x46: "France",
  0x48: "Netherlands",
  0x49: "Italy",
  0x4a: "Japan",
  0x4b: "Korea",
  0x50: "Europe (PAL)",
  0x53: "Spain",
  0x55: "Australia",
  0x58: "Europe (PAL, alternate)",
  0x59: "Europe (PAL, alternate 2)"
};

const MANUFACTURERS: Record<number, string> = {
  0x4e: "Nintendo",
  0x00: "Unlicensed/None"
};

export class N64Rom {
  readonly raw: Buffer;
  readonly format: RomFormat;
  readonly normalized: Buffer;
  readonly header: RomHeader;
  readonly checksum: RomChecksumResult | null;

  private constructor(raw: Buffer) {
    this.raw = raw;
    this.format = detectRomFormat(raw);
    this.normalized = normalizeToBigEndian(raw, this.format.byteOrder);
    this.header = parseHeader(this.normalized);
    this.checksum = this.normalized.length >= 0x101000 ? computeChecksum(this.normalized) : null;
  }

  static async open(filePath: string): Promise<N64Rom> {
    return new N64Rom(await readFileCapped(filePath));
  }

  static fromBuffer(buffer: Buffer): N64Rom {
    return new N64Rom(buffer);
  }

  get size(): number {
    return this.normalized.length;
  }

  codeRegions(options: { minWords?: number; gap?: number; maxRegions?: number } = {}): CodeRegion[] {
    return findCodeRegions(this.normalized, options);
  }

  asciiStrings(minLength = 6, limit = 200): Array<{ offset: number; text: string }> {
    return extractAsciiStrings(this.normalized, minLength, limit);
  }

  readU32At(offset: number): number {
    return this.normalized.readUInt32BE(offset);
  }
}

export function detectRomFormat(buffer: Buffer): RomFormat {
  if (buffer.length < 4) throw new Error("ROM is smaller than 4 bytes");
  const magic = buffer.readUInt32BE(0);
  if (magic === 0x80371240) {
    return {
      byteOrder: "big-endian",
      extensionHint: ".z64",
      magic: "0x80371240",
      description: "Native Nintendo 64 byte order (z64)"
    };
  }
  if (magic === 0x37804012) {
    return {
      byteOrder: "byteswapped",
      extensionHint: ".v64",
      magic: "0x37804012",
      description: "16-bit byteswapped (v64 / Doctor V64)"
    };
  }
  if (magic === 0x40123780) {
    return {
      byteOrder: "little-endian",
      extensionHint: ".n64",
      magic: "0x40123780",
      description: "32-bit little-endian word-swapped (n64 / Mr. Backup)"
    };
  }
  throw new Error(
    `Unrecognized N64 ROM magic 0x${magic.toString(16).padStart(8, "0")}. Expected 0x80371240, 0x37804012 or 0x40123780.`
  );
}

export function normalizeToBigEndian(buffer: Buffer, order: RomByteOrder): Buffer {
  const out = Buffer.from(buffer);
  if (order === "big-endian") return out;
  if (order === "byteswapped") {
    for (let i = 0; i + 1 < out.length; i += 2) {
      const a = out[i]!;
      out[i] = out[i + 1]!;
      out[i + 1] = a;
    }
    return out;
  }
  for (let i = 0; i + 3 < out.length; i += 4) {
    const a = out[i]!;
    const b = out[i + 1]!;
    out[i] = out[i + 3]!;
    out[i + 1] = out[i + 2]!;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
}

export function parseHeader(normalized: Buffer): RomHeader {
  if (normalized.length < 0x40) throw new Error("ROM too small for a Nintendo 64 header");
  const romName = normalized.toString("latin1", 0x20, 0x34).replace(/\0.*$/, "").trim();
  const countryCode = normalized[0x3e] ?? 0;
  return {
    romName,
    clockRate: normalized.readUInt32BE(0x04),
    entryPoint: normalized.readUInt32BE(0x08),
    release: normalized.readUInt32BE(0x0c),
    crc1: normalized.readUInt32BE(0x10),
    crc2: normalized.readUInt32BE(0x14),
    manufacturer: MANUFACTURERS[normalized[0x38] ?? 0] ?? `0x${(normalized[0x38] ?? 0).toString(16)}`,
    cartId: normalized.toString("latin1", 0x3b, 0x3e),
    countryCode,
    countryName: COUNTRIES[countryCode] ?? `unknown-0x${countryCode.toString(16)}`,
    version: normalized[0x3f] ?? 0
  };
}

function rol(value: number, shift: number): number {
  const bits = shift & 0x1f;
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

export function computeChecksum(normalized: Buffer): RomChecksumResult {
  let t1 = 0xf8ca4ddc;
  let t2 = 0xf8ca4ddc;
  let t3 = 0xf8ca4ddc;
  let t4 = 0xf8ca4ddc;
  let t5 = 0xf8ca4ddc;
  let t6 = 0xf8ca4ddc;
  for (let i = 0x1000; i < 0x101000; i += 4) {
    const d = normalized.readUInt32BE(i);
    if ((t6 + d) >>> 0 < t6) t4 = (t4 + 1) >>> 0;
    t6 = (t6 + d) >>> 0;
    t3 = (t3 ^ d) >>> 0;
    const r = rol(d, d & 0x1f);
    t5 = (t5 + r) >>> 0;
    if (t2 > d) t2 = (t2 ^ r) >>> 0;
    else t2 = (t2 ^ (t6 ^ d)) >>> 0;
    t1 = (t1 + (normalized.readUInt32BE(0x750 + (i & 0xff)) ^ d)) >>> 0;
  }
  const computedCrc1 = (t6 ^ t4 ^ t3) >>> 0;
  const computedCrc2 = (t5 ^ t2 ^ t1) >>> 0;
  const storedCrc1 = normalized.readUInt32BE(0x10);
  const storedCrc2 = normalized.readUInt32BE(0x14);
  return {
    computedCrc1,
    computedCrc2,
    storedCrc1,
    storedCrc2,
    matches: computedCrc1 === storedCrc1 && computedCrc2 === storedCrc2,
    note: "Nintendo 64 boot checksum over 0x1000-0x101000; a mismatch means the image was patched or is a hack."
  };
}

function isPrologue(word: number): boolean {
  return (word & 0xffff0000) === 0x27bd0000;
}

function isJal(word: number): boolean {
  return (word >>> 26) === 0x03;
}

export function findCodeRegions(
  normalized: Buffer,
  options: { minWords?: number; gap?: number; maxRegions?: number } = {}
): CodeRegion[] {
  const minWords = options.minWords ?? 24;
  const gap = options.gap ?? 0x400;
  const maxRegions = options.maxRegions ?? 64;
  const start = 0x1000;
  const end = normalized.length - 3;
  const hits: Array<{ offset: number; prologue: boolean }> = [];
  for (let offset = start; offset < end; offset += 4) {
    const word = normalized.readUInt32BE(offset);
    if (isPrologue(word) || isJal(word)) {
      hits.push({ offset, prologue: isPrologue(word) });
    }
  }
  const regions: CodeRegion[] = [];
  let cursor: { start: number; end: number; prologues: number; jalTargets: number } | null = null;
  for (const hit of hits) {
    const size = hit.offset - (cursor ? cursor.start : hit.offset);
    if (!cursor || hit.offset - cursor.end > gap || size > 0x80000) {
      if (cursor) regions.push(toRegion(cursor));
      cursor = { start: hit.offset, end: hit.offset + 4, prologues: hit.prologue ? 1 : 0, jalTargets: hit.prologue ? 0 : 1 };
    } else {
      cursor.end = hit.offset + 4;
      if (hit.prologue) cursor.prologues += 1;
      else cursor.jalTargets += 1;
    }
  }
  if (cursor) regions.push(toRegion(cursor));
  return regions
    .map((region) => ({ ...region, size: region.end - region.start }))
    .filter((region) => region.size / 4 >= minWords)
    .sort((a, b) => b.size - a.size)
    .slice(0, maxRegions)
    .sort((a, b) => a.start - b.start);
}

function toRegion(cursor: { start: number; end: number; prologues: number; jalTargets: number }): CodeRegion {
  return {
    start: cursor.start,
    end: cursor.end,
    size: cursor.end - cursor.start,
    prologues: cursor.prologues,
    jalTargets: cursor.jalTargets
  };
}

export function extractAsciiStrings(buffer: Buffer, minLength = 6, limit = 200): Array<{ offset: number; text: string }> {
  const results: Array<{ offset: number; text: string }> = [];
  let current = "";
  let start = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i]!;
    const printable = byte >= 0x20 && byte <= 0x7e;
    if (printable) {
      if (current.length === 0) start = i;
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= minLength) results.push({ offset: start, text: current });
      current = "";
      if (results.length >= limit) break;
    }
  }
  if (current.length >= minLength && results.length < limit) results.push({ offset: start, text: current });
  return results;
}

export function diffRoms(a: Buffer, b: Buffer, maxRanges = 200): { equal: boolean; ranges: Array<{ offset: number; length: number }>; differingBytes: number } {
  const length = Math.min(a.length, b.length);
  const ranges: Array<{ offset: number; length: number }> = [];
  let differingBytes = 0;
  let open: { offset: number; length: number } | null = null;
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) {
      differingBytes += 1;
      if (open && i === open.offset + open.length) {
        open.length += 1;
      } else {
        if (open) ranges.push(open);
        open = { offset: i, length: 1 };
        if (ranges.length >= maxRanges) break;
      }
    }
  }
  if (open) ranges.push(open);
  return {
    equal: differingBytes === 0 && a.length === b.length,
    ranges,
    differingBytes
  };
}
