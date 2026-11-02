import { encodePng, type Rgba } from "./texture.js";

export type GsPsm =
  | "PSMCT32"
  | "PSMCT16"
  | "PSMCT16S"
  | "PSMT8"
  | "PSMT4"
  | "PSMZ32"
  | "PSMZ16"
  | "PSMZ16S"
  | "PSMCT24"
  | "PSMT8H"
  | "PSMT4HL"
  | "PSMT4HH";

type Layout = {
  pageWidth: number;
  pageHeight: number;
  blockWidth: number;
  blockHeight: number;
  bytesPerPixel: number;
};

const LAYOUTS: Partial<Record<GsPsm, Layout>> = {
  PSMCT32: { pageWidth: 64, pageHeight: 32, blockWidth: 8, blockHeight: 8, bytesPerPixel: 4 },
  PSMZ32: { pageWidth: 64, pageHeight: 32, blockWidth: 8, blockHeight: 8, bytesPerPixel: 4 },
  PSMCT16: { pageWidth: 64, pageHeight: 64, blockWidth: 16, blockHeight: 8, bytesPerPixel: 2 },
  PSMCT16S: { pageWidth: 64, pageHeight: 64, blockWidth: 16, blockHeight: 8, bytesPerPixel: 2 },
  PSMZ16: { pageWidth: 64, pageHeight: 64, blockWidth: 16, blockHeight: 8, bytesPerPixel: 2 },
  PSMZ16S: { pageWidth: 64, pageHeight: 64, blockWidth: 16, blockHeight: 8, bytesPerPixel: 2 },
  PSMT8: { pageWidth: 128, pageHeight: 64, blockWidth: 16, blockHeight: 16, bytesPerPixel: 1 },
  PSMT4: { pageWidth: 128, pageHeight: 128, blockWidth: 32, blockHeight: 16, bytesPerPixel: 0.5 }
};

const PAGE_BYTES = 8192;

export type GsSwizzleResult = {
  offset: number;
  nibble?: 0 | 1;
};

export function gsSwizzleOffset(psm: GsPsm, x: number, y: number, width: number): GsSwizzleResult {
  const layout = LAYOUTS[psm];
  if (!layout) {
    throw new Error(
      `Swizzled layout for ${psm} is not implemented. Supported: ${Object.keys(LAYOUTS).join(", ")}. ` +
        "PSMCT24 and the H/L partial-byte modes require a hardware reference dump and are reported as UNSUPPORTED."
    );
  }
  if (width <= 0 || x < 0 || y < 0 || x >= width) {
    throw new Error(`Pixel (${x},${y}) outside the declared width ${width}`);
  }
  const blocksPerRow = layout.pageWidth / layout.blockWidth;
  const page = Math.floor(y / layout.pageHeight) * Math.max(1, Math.ceil(width / layout.pageWidth)) + Math.floor(x / layout.pageWidth);
  const blockX = Math.floor((x % layout.pageWidth) / layout.blockWidth);
  const blockY = Math.floor((y % layout.pageHeight) / layout.blockHeight);
  const block = blockY * blocksPerRow + blockX;
  const column = x % layout.blockWidth;
  const row = y % layout.blockHeight;
  const offsetInBlock = column * layout.blockHeight * layout.bytesPerPixel + row * layout.bytesPerPixel;
  const pageOffset = page * PAGE_BYTES;
  if (layout.bytesPerPixel === 0.5) {
    const byteOffset = Math.floor(offsetInBlock);
    return { offset: pageOffset + block * 256 + byteOffset, nibble: (row & 1) === 0 ? 0 : 1 };
  }
  return { offset: pageOffset + block * 256 + offsetInBlock };
}

export function gsPageCount(psm: GsPsm, width: number, height: number): number {
  const layout = LAYOUTS[psm];
  if (!layout) throw new Error(`Unsupported PSM for layout: ${psm}`);
  return Math.ceil(width / layout.pageWidth) * Math.ceil(height / layout.pageHeight);
}

export function gsRequiredBytes(psm: GsPsm, width: number, height: number): number {
  return gsPageCount(psm, width, height) * PAGE_BYTES;
}

export function deswizzleGs(psm: GsPsm, data: Buffer, width: number, height: number): { linear: Buffer; warnings: string[] } {
  const layout = LAYOUTS[psm];
  if (!layout) throw new Error(`Swizzled layout for ${psm} is not implemented.`);
  const required = gsRequiredBytes(psm, width, height);
  const warnings: string[] = [];
  if (data.length < required) {
    warnings.push(`Swizzled input is ${data.length} bytes but ${required} are required for ${width}x${height} ${psm}; missing pages read as zero.`);
  }
  const linearSize = Math.ceil(width * height * layout.bytesPerPixel);
  const linear = Buffer.alloc(linearSize);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const swizzled = gsSwizzleOffset(psm, x, y, width);
      const target = Math.floor((y * width + x) * layout.bytesPerPixel);
      if (layout.bytesPerPixel === 0.5) {
        const sourceByte = data[swizzled.offset] ?? 0;
        const targetByte = linear[Math.floor((y * width + x) / 2)] ?? 0;
        const nibble = swizzled.nibble === 0 ? sourceByte & 0x0f : sourceByte >>> 4;
        linear[Math.floor((y * width + x) / 2)] = (x & 1) === 0 ? (targetByte & 0xf0) | nibble : (targetByte & 0x0f) | (nibble << 4);
      } else {
        for (let byte = 0; byte < layout.bytesPerPixel; byte += 1) {
          linear[target + byte] = data[swizzled.offset + byte] ?? 0;
        }
      }
    }
  }
  return { linear, warnings };
}

export function swizzleGs(psm: GsPsm, linear: Buffer, width: number, height: number): Buffer {
  const layout = LAYOUTS[psm];
  if (!layout) throw new Error(`Swizzled layout for ${psm} is not implemented.`);
  const output = Buffer.alloc(gsRequiredBytes(psm, width, height));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const swizzled = gsSwizzleOffset(psm, x, y, width);
      if (layout.bytesPerPixel === 0.5) {
        const source = linear[Math.floor((y * width + x) / 2)] ?? 0;
        const nibble = (x & 1) === 0 ? source & 0x0f : source >>> 4;
        const current = output[swizzled.offset] ?? 0;
        output[swizzled.offset] = swizzled.nibble === 0 ? (current & 0xf0) | nibble : (current & 0x0f) | (nibble << 4);
      } else {
        const source = Math.floor((y * width + x) * layout.bytesPerPixel);
        for (let byte = 0; byte < layout.bytesPerPixel; byte += 1) {
          output[swizzled.offset + byte] = linear[source + byte] ?? 0;
        }
      }
    }
  }
  return output;
}

export type GsClut = {
  entries: Buffer;
  storage: "CSM1" | "CSM2";
  entryCount?: number;
};

export type GsDecodeRequest = {
  psm: GsPsm;
  data: Buffer;
  width: number;
  height: number;
  swizzled?: boolean;
  clut?: GsClut;
};

export type GsDecodeResult = {
  pixels: Rgba[];
  png: Buffer;
  layout: "linear" | "swizzled";
  psm: GsPsm;
  warnings: string[];
  limitations: string[];
};

function expand5(value: number): number {
  return (value << 3) | (value >>> 2);
}

function readClutEntry(clut: GsClut, index: number): Rgba {
  if (clut.storage === "CSM1") {
    throw new Error(
      "CSM1 CLUT storage is not decoded: its 16-entry block ordering is hardware-specific and Retrace will not guess it. " +
        "Re-export the CLUT in CSM2 order or provide a linear 32-bit palette."
    );
  }
  const offset = index * 4;
  if (offset + 3 >= clut.entries.length) return [0, 0, 0, 0];
  const value = clut.entries.readUInt32LE(offset);
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

export function decodeGsTexture(request: GsDecodeRequest): GsDecodeResult {
  const { psm, width, height } = request;
  const warnings: string[] = [];
  const limitations: string[] = [];
  if (width <= 0 || height <= 0) throw new Error("Width and height must be positive");
  const layout = LAYOUTS[psm];
  if (!layout) throw new Error(`Decoding ${psm} is not implemented; it is reported as UNSUPPORTED rather than approximated.`);

  let data = request.data;
  const layoutKind: "linear" | "swizzled" = request.swizzled === false ? "linear" : "swizzled";
  if (layoutKind === "swizzled") {
    const result = deswizzleGs(psm, data, width, height);
    data = result.linear;
    warnings.push(...result.warnings);
    limitations.push("Swizzle uses the documented GS block/page mapping; verify against a known VRAM dump before trusting colours.");
  } else {
    warnings.push("Linear input assumed; GS VRAM dumps are normally swizzled.");
  }

  const pixels: Rgba[] = [];
  for (let index = 0; index < width * height; index += 1) {
    if (psm === "PSMCT32" || psm === "PSMZ32") {
      const offset = index * 4;
      if (offset + 3 >= data.length) {
        pixels.push([0, 0, 0, 0]);
        continue;
      }
      const value = data.readUInt32LE(offset);
      pixels.push([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
    } else if (psm === "PSMCT16" || psm === "PSMCT16S" || psm === "PSMZ16" || psm === "PSMZ16S") {
      const offset = index * 2;
      if (offset + 1 >= data.length) {
        pixels.push([0, 0, 0, 0]);
        continue;
      }
      const value = data.readUInt16LE(offset);
      pixels.push([
        expand5(value & 0x1f),
        expand5((value >>> 5) & 0x1f),
        expand5((value >>> 10) & 0x1f),
        (value >>> 15) & 1 ? 255 : 0
      ]);
    } else if (psm === "PSMT8") {
      if (!request.clut) throw new Error("PSMT8 requires a CLUT buffer (32-bit RGBA entries, CSM2 order).");
      const entry = data[index] ?? 0;
      pixels.push(readClutEntry(request.clut, entry));
    } else if (psm === "PSMT4") {
      if (!request.clut) throw new Error("PSMT4 requires a CLUT buffer (32-bit RGBA entries, CSM2 order).");
      const byte = data[Math.floor(index / 2)] ?? 0;
      const entry = (index & 1) === 0 ? byte & 0x0f : byte >>> 4;
      pixels.push(readClutEntry(request.clut, entry));
    } else {
      throw new Error(`Decoding ${psm} is not implemented.`);
    }
  }

  if (psm === "PSMT8" || psm === "PSMT4") {
    limitations.push("CLUT decoding assumes CSM2 (linear) storage; CSM1 is refused instead of guessed.");
  }
  limitations.push("No alpha test, texture function or blending is applied: output is raw texel data.");

  return {
    pixels,
    png: encodePng(width, height, pixels),
    layout: layoutKind,
    psm,
    warnings,
    limitations
  };
}
