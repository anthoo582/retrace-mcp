import type { Endian } from "../mips/disasm.js";

export type PortPlatform = "n64" | "ps2";

export type TranslationWord = {
  index: number;
  sourceWord: string;
  targetWord: string;
  status: "portable" | "manual_review" | "unsupported";
  reason?: string;
};

export type TranslationReport = {
  source: { platform: PortPlatform; endian: Endian };
  target: { platform: PortPlatform; endian: Endian };
  inputBytes: number;
  outputBytes: number;
  wordCount: number;
  portable: boolean;
  translatedHex: string;
  words: TranslationWord[];
  warnings: string[];
  limitations: string[];
};

const WIDTH_SENSITIVE_OPCODES = new Set([0x18, 0x19, 0x1a, 0x1b, 0x27, 0x2c, 0x2d, 0x37, 0x3c, 0x3f]);
const UNSUPPORTED_OPCODES = new Set([0x10, 0x11, 0x12, 0x13, 0x1c, 0x1f]);

function readWord(bytes: Buffer, offset: number, endian: Endian): number {
  return endian === "big" ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset);
}

function writeWord(word: number, endian: Endian): Buffer {
  const out = Buffer.alloc(4);
  if (endian === "big") out.writeUInt32BE(word >>> 0, 0);
  else out.writeUInt32LE(word >>> 0, 0);
  return out;
}

function wordStatus(word: number): TranslationWord["status"] {
  const opcode = word >>> 26;
  if (UNSUPPORTED_OPCODES.has(opcode)) return "unsupported";
  if (WIDTH_SENSITIVE_OPCODES.has(opcode)) return "manual_review";
  return "portable";
}

function reasonFor(word: number, status: TranslationWord["status"]): string | undefined {
  if (status === "unsupported") return `coprocessor or console-specific opcode 0x${(word >>> 26).toString(16)}`;
  if (status === "manual_review") return "64-bit load/store or arithmetic width may require ABI and alignment changes";
  return undefined;
}

export function translateMipsBinary(
  bytes: Buffer,
  options: {
    sourcePlatform: PortPlatform;
    targetPlatform: PortPlatform;
    sourceEndian?: Endian;
    targetEndian?: Endian;
    allowUnsupported?: boolean;
  }
): TranslationReport {
  if (bytes.length === 0) throw new Error("Binary input is empty.");
  if (bytes.length % 4 !== 0) throw new Error(`MIPS input must be a multiple of 4 bytes (got ${bytes.length}).`);
  const sourceEndian = options.sourceEndian ?? (options.sourcePlatform === "n64" ? "big" : "little");
  const targetEndian = options.targetEndian ?? (options.targetPlatform === "n64" ? "big" : "little");
  const words: TranslationWord[] = [];
  const output = Buffer.alloc(bytes.length);
  const warnings: string[] = [];
  const limitations = [
    "This preserves MIPS instruction encodings and changes byte order; it is not a compiler or semantic decompiler.",
    "Branches, jumps, absolute addresses, ABI conventions, peripherals and runtime calls still require port-specific relocation and review."
  ];
  let portable = true;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const sourceWord = readWord(bytes, offset, sourceEndian);
    const status = wordStatus(sourceWord);
    const reason = reasonFor(sourceWord, status);
    const targetWord = writeWord(sourceWord, targetEndian);
    targetWord.copy(output, offset);
    words.push({
      index: offset / 4,
      sourceWord: `0x${sourceWord.toString(16).padStart(8, "0")}`,
      targetWord: `0x${sourceWord.toString(16).padStart(8, "0")}`,
      status,
      ...(reason ? { reason } : {})
    });
    if (status === "unsupported") portable = false;
    if (status === "manual_review") warnings.push(`word ${offset / 4}: ${reason}`);
  }
  if (!portable && !options.allowUnsupported) {
    throw new Error("Translation refused: input contains console-specific or coprocessor instructions. Set allowUnsupported=true only to emit a review artifact.");
  }
  if (options.allowUnsupported && !portable) warnings.push("Output contains unsupported instructions and must not be executed without manual replacement.");
  return {
    source: { platform: options.sourcePlatform, endian: sourceEndian },
    target: { platform: options.targetPlatform, endian: targetEndian },
    inputBytes: bytes.length,
    outputBytes: output.length,
    wordCount: words.length,
    portable,
    translatedHex: output.toString("hex"),
    words,
    warnings: [...new Set(warnings)],
    limitations
  };
}

export function buildPortPlan(sourcePlatform: PortPlatform, targetPlatform: PortPlatform) {
  const samePlatform = sourcePlatform === targetPlatform;
  return {
    sourcePlatform,
    targetPlatform,
    status: samePlatform ? "analysis_only" : "planned",
    stages: [
      { id: "inventory", title: "Inventario reproducible", outputs: ["ROM/ELF hashes", "sections", "symbols", "assets"] },
      { id: "isa", title: "Mapa de ISA y ABI", outputs: ["function matches", "unsupported opcodes", "calling-convention notes"] },
      { id: "runtime", title: "Sustitución de runtime", outputs: ["memory map", "DMA/IO boundary list", "audio/video service map"] },
      { id: "assets", title: "Conversión de gráficos y audio", outputs: ["texture/audio conversion manifest", "round-trip checksums"] },
      { id: "build", title: "Build y pruebas", outputs: ["clean build log", "emulator trace", "equivalence evidence"] }
    ],
    risks: samePlatform
      ? ["Source and target are the same console; use this as an analysis checklist only."]
      : [
          "N64 and PS2 have different endian defaults, memory maps, ABI details and graphics/audio runtimes.",
          "A byte-order conversion cannot port peripherals, scheduler behavior, assets or game logic by itself.",
          "Only confirmed equivalences with concrete evidence should be promoted to the knowledge graph."
        ],
    stopConditions: [
      "Do not emit executable output when an unsupported opcode is present.",
      "Do not mark a function equivalent without runtime or test evidence.",
      "Keep original binaries immutable and write generated artifacts under a review directory."
    ]
  };
}

export function validateTranslation(hex: string, sourcePlatform: PortPlatform, targetPlatform: PortPlatform) {
  const clean = hex.replace(/\s+/g, "");
  if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2 !== 0) throw new Error("hex must contain an even number of hexadecimal digits.");
  const original = Buffer.from(clean, "hex");
  const forward = translateMipsBinary(original, { sourcePlatform, targetPlatform });
  const backward = translateMipsBinary(Buffer.from(forward.translatedHex, "hex"), {
    sourcePlatform: targetPlatform,
    targetPlatform: sourcePlatform
  });
  return {
    sourcePlatform,
    targetPlatform,
    roundTripExact: backward.translatedHex === clean.toLowerCase(),
    forwardPortable: forward.portable,
    forwardWords: forward.wordCount,
    notes: ["Round-trip checks encoding preservation only; it does not prove gameplay or runtime equivalence."]
  };
}
