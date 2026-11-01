import { readFileCapped } from "../security/paths.js";

export type ElfClass = 32 | 64;
export type ElfEndian = "little" | "big";

export type ElfHeader = {
  elfClass: ElfClass;
  endian: ElfEndian;
  osabi: number;
  type: number;
  typeName: string;
  machine: number;
  machineName: string;
  entry: number;
  phoff: number;
  shoff: number;
  flags: number;
  ehsize: number;
  phentsize: number;
  phnum: number;
  shentsize: number;
  shnum: number;
  shstrndx: number;
};

export type ElfSection = {
  index: number;
  name: string;
  type: number;
  typeName: string;
  flags: number;
  flagNames: string[];
  addr: number;
  offset: number;
  size: number;
  link: number;
  info: number;
  addralign: number;
  entsize: number;
  executable: boolean;
  allocated: boolean;
};

export type ElfSegment = {
  index: number;
  type: number;
  typeName: string;
  flags: number;
  flagNames: string[];
  offset: number;
  vaddr: number;
  paddr: number;
  filesz: number;
  memsz: number;
  align: number;
  executable: boolean;
};

export type ElfSymbol = {
  index: number;
  name: string;
  value: number;
  size: number;
  binding: string;
  type: string;
  visibility: string;
  shndx: number;
  section?: string;
};

export type ElfRelocation = {
  section: string;
  offset: number;
  symbolIndex: number;
  symbol?: string;
  type: number;
  typeName: string;
  addend?: number;
};

const SHT: Record<number, string> = {
  0: "NULL",
  1: "PROGBITS",
  2: "SYMTAB",
  3: "STRTAB",
  4: "RELA",
  5: "HASH",
  6: "DYNAMIC",
  7: "NOTE",
  8: "NOBITS",
  9: "REL",
  10: "SHLIB",
  11: "DYNSYM",
  14: "INIT_ARRAY",
  15: "FINI_ARRAY",
  16: "PREINIT_ARRAY",
  17: "GROUP",
  18: "SYMTAB_SHNDX",
  0x70000000: "MIPS_REGINFO",
  0x70000001: "MIPS_OPTIONS",
  0x70000002: "MIPS_ABIFLAGS",
  0x70000003: "MIPS_MSYM"
};

const PT: Record<number, string> = {
  0: "NULL",
  1: "LOAD",
  2: "DYNAMIC",
  3: "INTERP",
  4: "NOTE",
  5: "SHLIB",
  6: "PHDR",
  7: "TLS",
  0x60000000: "MIPS_ABIFLAGS"
};

const EM: Record<number, string> = {
  3: "Intel 80386",
  8: "MIPS",
  40: "ARM",
  62: "x86-64",
  183: "AArch64",
  243: "RISC-V"
};

const ET: Record<number, string> = {
  0: "NONE",
  1: "REL",
  2: "EXEC",
  3: "DYN",
  4: "CORE"
};

const SHN: Record<number, string> = {
  0: "UNDEF",
  0xfff1: "ABS",
  0xfff2: "COMMON",
  0xffff: "XINDEX"
};

const MIPS_ARCH: Record<number, string> = {
  1: "MIPS I",
  2: "MIPS II",
  3: "MIPS III",
  4: "MIPS IV",
  5: "MIPS V",
  6: "MIPS32",
  7: "MIPS64",
  8: "MIPS32r2",
  9: "MIPS64r2",
  10: "MIPS32r6",
  11: "MIPS64r6"
};

const MIPS_MACH: Record<number, string> = {
  0x00000000: "none",
  0x00080000: "Allegrex",
  0x00810000: "R3900",
  0x00820000: "R4010",
  0x00830000: "R4100",
  0x00850000: "R4650",
  0x00870000: "R4120",
  0x00880000: "R4111",
  0x008a0000: "SB1",
  0x00910000: "R5400",
  0x00920000: "R5900 (PlayStation 2 EE)",
  0x00980000: "R5500",
  0x00990000: "R9000"
};

function flagNames(flags: number, executable: number, writable: number, alloc: number): string[] {
  const names: string[] = [];
  if (flags & executable) names.push("X");
  if (flags & writable) names.push("W");
  if (flags & alloc) names.push("A");
  return names;
}

export class ElfFile {
  header!: ElfHeader;
  readonly sections: ElfSection[];
  readonly segments: ElfSegment[];
  readonly symbols: ElfSymbol[];
  readonly dynamicSymbols: ElfSymbol[];
  readonly relocations: ElfRelocation[];
  private readonly buffer: Buffer;

  private constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.header = this.parseHeader();
    this.sections = this.parseSections();
    this.segments = this.parseSegments();
    this.symbols = this.readSymbols(".symtab");
    this.dynamicSymbols = this.readSymbols(".dynsym");
    this.relocations = this.readRelocations();
  }

  static async open(filePath: string): Promise<ElfFile> {
    const buffer = await readFileCapped(filePath);
    return new ElfFile(buffer);
  }

  static fromBuffer(buffer: Buffer): ElfFile {
    return new ElfFile(buffer);
  }

  get isMips(): boolean {
    return this.header.machine === 8;
  }

  get architectureHint(): string {
    if (!this.isMips) return this.header.machineName;
    const arch = MIPS_ARCH[(this.header.flags >> 28) & 0xf] ?? `arch-${(this.header.flags >> 28) & 0xf}`;
    const mach = MIPS_MACH[this.header.flags & 0x00ff0000] ?? "unknown-mach";
    const abi = (this.header.flags & 0x00000fff).toString(16);
    return `MIPS ${arch} / mach=${mach} / abi=0x${abi} / class=ELF${this.header.elfClass} ${this.header.endian}-endian`;
  }

  private u16(offset: number): number {
    return this.header.endian === "little" ? this.buffer.readUInt16LE(offset) : this.buffer.readUInt16BE(offset);
  }

  private u32(offset: number): number {
    return this.header.endian === "little" ? this.buffer.readUInt32LE(offset) : this.buffer.readUInt32BE(offset);
  }

  private u64(offset: number): number {
    const value =
      this.header.endian === "little" ? this.buffer.readBigUInt64LE(offset) : this.buffer.readBigUInt64BE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("ELF value exceeds JavaScript safe integer range");
    }
    return Number(value);
  }

  private word(offset: number): number {
    return this.header.elfClass === 64 ? this.u64(offset) : this.u32(offset);
  }

  private parseHeader(): ElfHeader {
    const buf = this.buffer;
    if (buf.length < 52) throw new Error("File too small to be an ELF image");
    if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
      throw new Error("Missing ELF magic (0x7f ELF)");
    }
    const elfClass = buf[4] === 2 ? 64 : 32;
    const endian = buf[5] === 2 ? "big" : "little";
    const is64 = elfClass === 64;
    const header: ElfHeader = {
      elfClass,
      endian,
      osabi: buf[7] ?? 0,
      type: 0,
      typeName: "",
      machine: 0,
      machineName: "",
      entry: 0,
      phoff: 0,
      shoff: 0,
      flags: 0,
      ehsize: 0,
      phentsize: 0,
      phnum: 0,
      shentsize: 0,
      shnum: 0,
      shstrndx: 0
    };
    this.header = header;
    header.type = this.u16(16);
    header.machine = this.u16(18);
    header.typeName = ET[header.type] ?? `type-${header.type}`;
    header.machineName = EM[header.machine] ?? `machine-${header.machine}`;
    if (is64) {
      header.entry = this.u64(24);
      header.phoff = this.u64(32);
      header.shoff = this.u64(40);
      header.flags = this.u32(48);
      header.ehsize = this.u16(52);
      header.phentsize = this.u16(54);
      header.phnum = this.u16(56);
      header.shentsize = this.u16(58);
      header.shnum = this.u16(60);
      header.shstrndx = this.u16(62);
    } else {
      header.entry = this.u32(24);
      header.phoff = this.u32(28);
      header.shoff = this.u32(32);
      header.flags = this.u32(36);
      header.ehsize = this.u16(40);
      header.phentsize = this.u16(42);
      header.phnum = this.u16(44);
      header.shentsize = this.u16(46);
      header.shnum = this.u16(48);
      header.shstrndx = this.u16(50);
    }
    return header;
  }

  private parseSections(): ElfSection[] {
    const h = this.header;
    if (h.shoff === 0 || h.shnum === 0) return [];
    const sections: ElfSection[] = [];
    const is64 = h.elfClass === 64;
    const size = is64 ? 64 : 40;
    const count = h.shnum === 0 && h.shoff !== 0 ? this.u32(h.shoff + (is64 ? 32 : 20)) : h.shnum;
    const offsetOf = (index: number) => h.shoff + index * (h.shentsize || size);
    const raw: Array<Omit<ElfSection, "name" | "typeName" | "flagNames" | "executable" | "allocated">> = [];
    for (let i = 0; i < count; i += 1) {
      const base = offsetOf(i);
      if (base + (h.shentsize || size) > this.buffer.length) break;
      const section =
        is64
          ? {
              index: i,
              type: this.u32(base + 4),
              flags: this.u64(base + 8),
              addr: this.u64(base + 16),
              offset: this.u64(base + 24),
              size: this.u64(base + 32),
              link: this.u32(base + 40),
              info: this.u32(base + 44),
              addralign: this.u64(base + 48),
              entsize: this.u64(base + 56),
              nameOffset: this.u32(base)
            }
          : {
              index: i,
              type: this.u32(base + 4),
              flags: this.u32(base + 8),
              addr: this.u32(base + 12),
              offset: this.u32(base + 16),
              size: this.u32(base + 20),
              link: this.u32(base + 24),
              info: this.u32(base + 28),
              addralign: this.u32(base + 32),
              entsize: this.u32(base + 36),
              nameOffset: this.u32(base)
            };
      raw.push(section as never);
    }
    const shstr = raw[h.shstrndx];
    const strtabOffset = shstr ? shstr.offset : 0;
    const strtabSize = shstr ? shstr.size : 0;
    for (const entry of raw) {
      const name = this.readCString(strtabOffset, strtabSize, (entry as unknown as { nameOffset: number }).nameOffset);
      sections.push({
        index: entry.index,
        name,
        type: entry.type,
        typeName: SHT[entry.type] ?? `type-0x${entry.type.toString(16)}`,
        flags: entry.flags,
        flagNames: flagNames(entry.flags, 0x4, 0x1, 0x2),
        addr: entry.addr,
        offset: entry.offset,
        size: entry.size,
        link: entry.link,
        info: entry.info,
        addralign: entry.addralign,
        entsize: entry.entsize,
        executable: (entry.flags & 0x4) !== 0,
        allocated: (entry.flags & 0x2) !== 0
      });
    }
    return sections;
  }

  private parseSegments(): ElfSegment[] {
    const h = this.header;
    if (h.phoff === 0 || h.phnum === 0) return [];
    const is64 = h.elfClass === 64;
    const size = is64 ? 56 : 32;
    const segments: ElfSegment[] = [];
    for (let i = 0; i < h.phnum; i += 1) {
      const base = h.phoff + i * (h.phentsize || size);
      if (base + (h.phentsize || size) > this.buffer.length) break;
      const segment: ElfSegment = is64
        ? {
            index: i,
            type: this.u32(base),
            typeName: "",
            flags: this.u32(base + 4),
            flagNames: [],
            offset: this.u64(base + 8),
            vaddr: this.u64(base + 16),
            paddr: this.u64(base + 24),
            filesz: this.u64(base + 32),
            memsz: this.u64(base + 40),
            align: this.u64(base + 48),
            executable: false
          }
        : {
            index: i,
            type: this.u32(base),
            typeName: "",
            flags: this.u32(base + 24),
            flagNames: [],
            offset: this.u32(base + 4),
            vaddr: this.u32(base + 8),
            paddr: this.u32(base + 12),
            filesz: this.u32(base + 16),
            memsz: this.u32(base + 20),
            align: this.u32(base + 28),
            executable: false
          };
      segment.typeName = PT[segment.type] ?? `type-0x${segment.type.toString(16)}`;
      segment.flagNames = flagNames(segment.flags, 0x1, 0x2, 0x4);
      segment.executable = (segment.flags & 0x1) !== 0;
      segments.push(segment);
    }
    return segments;
  }

  private readSymbols(sectionName: string): ElfSymbol[] {
    const section = this.sections.find((entry) => entry.name === sectionName);
    if (!section) return [];
    const strtab = this.sections[section.link];
    const symbols: ElfSymbol[] = [];
    const is64 = this.header.elfClass === 64;
    const entrySize = section.entsize || (is64 ? 24 : 16);
    const count = Math.floor(section.size / entrySize);
    const base = section.offset;
    if (base + section.size > this.buffer.length) return [];
    for (let i = 0; i < count; i += 1) {
      const offset = base + i * entrySize;
      const nameOffset = this.u32(offset);
      const info = this.buffer[offset + (is64 ? 4 : 12)] ?? 0;
      const other = this.buffer[offset + (is64 ? 5 : 13)] ?? 0;
      const shndx = this.u16(offset + (is64 ? 6 : 14));
      const value = is64 ? this.u64(offset + 8) : this.u32(offset + 4);
      const size = is64 ? this.u64(offset + 16) : this.u32(offset + 8);
      const binding = info >> 4;
      const type = info & 0xf;
      const name = strtab ? this.readCString(strtab.offset, strtab.size, nameOffset) : "";
      symbols.push({
        index: i,
        name,
        value,
        size,
        binding: ["LOCAL", "GLOBAL", "WEAK"][binding] ?? `bind-${binding}`,
        type: ["NOTYPE", "OBJECT", "FUNC", "SECTION", "FILE", "COMMON", "TLS"][type] ?? `type-${type}`,
        visibility: ["DEFAULT", "INTERNAL", "HIDDEN", "PROTECTED"][other & 0x3] ?? "DEFAULT",
        shndx,
        section: shndx === 0 ? undefined : this.sections.find((entry) => entry.index === shndx)?.name
      });
    }
    return symbols;
  }

  private readRelocations(): ElfRelocation[] {
    const relocations: ElfRelocation[] = [];
    const symbols = this.symbols.length > 0 ? this.symbols : this.dynamicSymbols;
    for (const section of this.sections) {
      if (section.typeName !== "REL" && section.typeName !== "RELA") continue;
      const is64 = this.header.elfClass === 64;
      const entrySize = section.entsize || (is64 ? (section.typeName === "RELA" ? 24 : 16) : section.typeName === "RELA" ? 12 : 8);
      const count = Math.floor(section.size / entrySize);
      const base = section.offset;
      if (base + section.size > this.buffer.length) continue;
      for (let i = 0; i < count; i += 1) {
        const offset = base + i * entrySize;
        const relOffset = is64 ? this.u64(offset) : this.u32(offset);
        const info = is64 ? this.u64(offset + 8) : this.u32(offset + 4);
        const symbolIndex = is64 ? Math.floor(info / 0x100000000) : info >>> 8;
        const type = this.header.machine === 8 ? (is64 ? info % 0x100 : info & 0xff) : is64 ? info % 0x100000000 : info & 0xff;
        const addend =
          section.typeName === "RELA" ? (is64 ? this.u64(offset + 16) : this.u32(offset + 8)) : undefined;
        const symbol = symbols[symbolIndex];
        relocations.push({
          section: section.name,
          offset: relOffset,
          symbolIndex,
          symbol: symbol?.name || undefined,
          type,
          typeName: this.mipsRelocName(type),
          addend
        });
      }
    }
    return relocations;
  }

  private mipsRelocName(type: number): string {
    const names: Record<number, string> = {
      0: "R_MIPS_NONE",
      1: "R_MIPS_16",
      2: "R_MIPS_32",
      3: "R_MIPS_REL32",
      4: "R_MIPS_26",
      5: "R_MIPS_HI16",
      6: "R_MIPS_LO16",
      7: "R_MIPS_GPREL16",
      8: "R_MIPS_LITERAL",
      9: "R_MIPS_GOT16",
      10: "R_MIPS_PC16",
      11: "R_MIPS_CALL16",
      12: "R_MIPS_GPREL32",
      18: "R_MIPS_64",
      37: "R_MIPS_JALR",
      38: "R_MIPS_TLS_DTPMOD32",
      126: "R_MIPS_GLOB_DAT",
      127: "R_MIPS_COPY"
    };
    return names[type] ?? `R_MIPS_${type}`;
  }

  private readCString(offset: number, size: number, relative: number): string {
    if (offset === 0 || relative >= size) return "";
    const start = offset + relative;
    let end = start;
    const limit = Math.min(offset + size, this.buffer.length);
    while (end < limit && this.buffer[end] !== 0) end += 1;
    return this.buffer.toString("utf8", start, end);
  }

  sectionData(section: ElfSection): Buffer {
    if (section.typeName === "NOBITS") return Buffer.alloc(0);
    return this.buffer.subarray(section.offset, section.offset + section.size);
  }

  executableSections(): ElfSection[] {
    return this.sections.filter((section) => section.executable && section.size > 0 && section.typeName === "PROGBITS");
  }

  symbolAt(address: number): ElfSymbol | undefined {
    let best: ElfSymbol | undefined;
    for (const symbol of this.symbols) {
      if (symbol.value === 0) continue;
      if (address < symbol.value) continue;
      if (symbol.size > 0 && address >= symbol.value + symbol.size) continue;
      if (symbol.size === 0 && address !== symbol.value) continue;
      if (!best || symbol.value > best.value) best = symbol;
    }
    return best;
  }

  sectionAt(address: number): ElfSection | undefined {
    return this.sections.find(
      (section) => section.addr !== 0 && address >= section.addr && address < section.addr + section.size
    );
  }

  functionSymbols(): ElfSymbol[] {
    return this.symbols.filter((symbol) => symbol.type === "FUNC" && symbol.value !== 0);
  }

  summary() {
    return {
      header: this.header,
      architecture: this.architectureHint,
      sections: this.sections.length,
      segments: this.segments.length,
      symbols: this.symbols.length,
      dynamicSymbols: this.dynamicSymbols.length,
      functions: this.functionSymbols().length,
      relocations: this.relocations.length,
      declaredSize: this.buffer.length
    };
  }
}

export function symbolLabel(symbol: ElfSymbol | undefined, address: number): string {
  if (!symbol) return `sub_${address.toString(16).padStart(8, "0")}`;
  if (symbol.name) return symbol.name;
  const section = symbol.section ?? (symbol.shndx === 0 ? "UND" : `shndx-${symbol.shndx}`);
  return `sub_${address.toString(16).padStart(8, "0")}_${section}`;
}

export const ELF_CONSTANTS = { SHN, SHT, PT, EM, ET };
