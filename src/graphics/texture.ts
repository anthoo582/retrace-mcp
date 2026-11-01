import zlib from "node:zlib";

export type Rgba = [number, number, number, number];

const CRC_TABLE: number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

export function encodePng(width: number, height: number, pixels: Rgba[]): Buffer {
  if (pixels.length !== width * height) throw new Error("Pixel count does not match width*height");
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = pixels[y * width + x]!;
      const offset = rowStart + 1 + x * 4;
      raw[offset] = pixel[0];
      raw[offset + 1] = pixel[1];
      raw[offset + 2] = pixel[2];
      raw[offset + 3] = pixel[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

export type N64Format = "RGBA" | "YUV" | "CI" | "IA" | "I" | "unknown";
export type N64Size = 4 | 8 | 16 | 32;

export type N64TextureInfo = {
  format: N64Format;
  size: N64Size;
  width: number;
  height: number;
  bytesPerPixel: number;
  requiredBytes: number;
  availableBytes: number;
  complete: boolean;
  paletteEntries?: number;
};

const N64_FORMATS: N64Format[] = ["RGBA", "YUV", "CI", "IA", "I"];

export function n64TextureInfo(
  formatCode: number,
  sizeCode: number,
  width: number,
  height: number,
  availableBytes: number,
  paletteEntries?: number
): N64TextureInfo {
  const format = N64_FORMATS[formatCode] ?? "unknown";
  const size = ([4, 8, 16, 32] as const)[sizeCode] ?? 16;
  const bpp = size / 8;
  const required = Math.ceil((width * height * bpp) | 0);
  return {
    format,
    size,
    width,
    height,
    bytesPerPixel: bpp,
    requiredBytes: required,
    availableBytes,
    complete: availableBytes >= required,
    paletteEntries
  };
}

export function decodeRgba16(value: number): Rgba {
  const r = (value >>> 11) & 0x1f;
  const g = (value >>> 6) & 0x1f;
  const b = (value >>> 1) & 0x1f;
  const a = value & 0x1;
  return [expand5(r), expand5(g), expand5(b), a ? 255 : 0];
}

function expand5(value: number): number {
  return (value << 3) | (value >>> 2);
}

export function decodeRgba32(value: number): Rgba {
  const r = (value >>> 24) & 0xff;
  const g = (value >>> 16) & 0xff;
  const b = (value >>> 8) & 0xff;
  const a = value & 0xff;
  return [r, g, b, a];
}

export function decodeIa(value: number, bits: 4 | 8 | 16): Rgba {
  if (bits === 16) {
    const i = (value >>> 8) & 0xff;
    const a = value & 0xff;
    return [i, i, i, a];
  }
  if (bits === 8) {
    const i = (value >>> 4) & 0xf;
    const a = value & 0xf;
    const expanded = (i << 4) | i;
    return [expanded, expanded, expanded, (a << 4) | a];
  }
  const i = (value >>> 1) & 0x7;
  const a = value & 0x1;
  const expanded = (i << 5) | (i << 2) | (i >>> 1);
  return [expanded, expanded, expanded, a ? 255 : 0];
}

export function decodeIntensity(value: number, bits: 4 | 8 | 16): Rgba {
  let i: number;
  if (bits === 16) i = value & 0xffff;
  else if (bits === 8) i = value & 0xff;
  else i = (value & 0xf) * 17;
  const level = bits === 16 ? i >>> 8 : i;
  return [level, level, level, 255];
}

export type N64DecodeRequest = {
  data: Buffer;
  format: N64Format;
  size: N64Size;
  width: number;
  height: number;
  palette?: Buffer;
  paletteEndian?: "big" | "little";
  dataEndian?: "big" | "little";
};

export function decodeN64Texture(request: N64DecodeRequest): { pixels: Rgba[]; png: Buffer; warnings: string[] } {
  const { data, format, size, width, height } = request;
  const warnings: string[] = [];
  const pixels: Rgba[] = [];
  const dataEndian = request.dataEndian ?? "big";
  const paletteEndian = request.paletteEndian ?? "big";
  const read16 = (buffer: Buffer, offset: number) =>
    dataEndian === "big" ? buffer.readUInt16BE(offset) : buffer.readUInt16LE(offset);
  const read32 = (buffer: Buffer, offset: number) =>
    dataEndian === "big" ? buffer.readUInt32BE(offset) : buffer.readUInt32LE(offset);

  const palette: Rgba[] = [];
  if ((format === "CI") && request.palette) {
    const entries = Math.min(request.palette.length / 2, 256);
    for (let i = 0; i < entries; i += 1) {
      const value = paletteEndian === "big" ? request.palette.readUInt16BE(i * 2) : request.palette.readUInt16LE(i * 2);
      palette.push(decodeRgba16(value));
    }
  }
  if (format === "CI" && palette.length === 0) {
    throw new Error("CI texture requires a TLUT palette buffer (RGBA16 entries).");
  }

  const total = width * height;
  const needed = Math.ceil((total * (size / 8)) | 0);
  if (data.length < needed) warnings.push(`Truncated texture data: need ${needed} bytes, got ${data.length}. Missing pixels are transparent.`);

  for (let index = 0; index < total; index += 1) {
    let pixel: Rgba = [0, 0, 0, 0];
    const byteOffset = Math.floor((index * size) / 8);
    if (byteOffset >= data.length) {
      pixels.push(pixel);
      continue;
    }
    if (format === "RGBA" && size === 16) {
      pixel = decodeRgba16(read16(data, byteOffset));
    } else if (format === "RGBA" && size === 32) {
      pixel = decodeRgba32(read32(data, byteOffset));
    } else if (format === "IA" && size === 16) {
      pixel = decodeIa(read16(data, byteOffset), 16);
    } else if (format === "IA" && size === 8) {
      pixel = decodeIa(data[byteOffset]!, 8);
    } else if (format === "IA" && size === 4) {
      const byte = data[byteOffset]!;
      const nibble = index % 2 === 0 ? byte >>> 4 : byte & 0xf;
      pixel = decodeIa(nibble, 4);
    } else if (format === "I" && size === 16) {
      pixel = decodeIntensity(read16(data, byteOffset), 16);
    } else if (format === "I" && size === 8) {
      pixel = decodeIntensity(data[byteOffset]!, 8);
    } else if (format === "I" && size === 4) {
      const byte = data[byteOffset]!;
      pixel = decodeIntensity(index % 2 === 0 ? byte >>> 4 : byte & 0xf, 4);
    } else if (format === "CI" && size === 8) {
      const entry = data[byteOffset]!;
      pixel = palette[entry] ?? [0, 0, 0, 0];
      if (!palette[entry]) warnings.push(`Palette index ${entry} out of range (palette has ${palette.length} entries).`);
    } else if (format === "CI" && size === 4) {
      const byte = data[byteOffset]!;
      const entry = index % 2 === 0 ? byte >>> 4 : byte & 0xf;
      pixel = palette[entry] ?? [0, 0, 0, 0];
    } else if (format === "YUV") {
      throw new Error("YUV textures require the RDP YUV pipeline; decoding is not implemented in this module.");
    } else {
      throw new Error(`Unsupported N64 texture combination: format=${format} size=${size}`);
    }
    pixels.push(pixel);
  }

  return { pixels, png: encodePng(width, height, pixels), warnings };
}

export type Ps2Psm = "PSMCT32" | "PSMCT24" | "PSMCT16" | "PSMCT16S" | "PSMT8" | "PSMT8H" | "PSMT4" | "PSMT4HL" | "PSMT4HH" | "PSMZ32" | "PSMZ24" | "PSMZ16" | "PSMZ16S";

export function ps2LinearToRgba(psm: Ps2Psm, data: Buffer, width: number, height: number): { pixels: Rgba[]; warnings: string[] } {
  const warnings: string[] = ["Linear (unswizzled) input assumed. GS VRAM dumps are swizzled and must be deswizzled with the matching PSM before this conversion."];
  const pixels: Rgba[] = [];
  const total = width * height;
  for (let index = 0; index < total; index += 1) {
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
      const r = value & 0x1f;
      const g = (value >>> 5) & 0x1f;
      const b = (value >>> 10) & 0x1f;
      const a = (value >>> 15) & 0x1;
      pixels.push([expand5(r), expand5(g), expand5(b), a ? 255 : 0]);
    } else if (psm === "PSMT8") {
      const byte = data[index];
      pixels.push(byte === undefined ? [0, 0, 0, 0] : [byte, byte, byte, 255]);
    } else if (psm === "PSMT4") {
      const byte = data[Math.floor(index / 2)] ?? 0;
      const nibble = index % 2 === 0 ? byte & 0xf : byte >>> 4;
      pixels.push([nibble * 17, nibble * 17, nibble * 17, 255]);
    } else {
      throw new Error(`Unsupported PS2 pixel storage mode for linear conversion: ${psm}`);
    }
  }
  if (psm === "PSMT8" || psm === "PSMT4") warnings.push("Palette-indexed mode: output is greyscale indices; apply the CLUT to obtain real colours.");
  return { pixels, warnings };
}

export function analyzePalette(palette: Buffer, endian: "big" | "little" = "big"): {
  entries: number;
  transparent: number;
  opaque: number;
  uniqueColours: number;
  firstEntries: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const entries = Math.floor(palette.length / 2);
  if (entries === 0) throw new Error("Empty palette buffer");
  if (entries > 256) warnings.push(`Palette has ${entries} entries (>256); only the first 256 are addressable by CI8.`);
  const colours = new Set<string>();
  let transparent = 0;
  const firstEntries: string[] = [];
  for (let i = 0; i < Math.min(entries, 32); i += 1) {
    const value = endian === "big" ? palette.readUInt16BE(i * 2) : palette.readUInt16LE(i * 2);
    const [r, g, b, a] = decodeRgba16(value);
    if (a === 0) transparent += 1;
    colours.add(`${r},${g},${b},${a}`);
    firstEntries.push(`#${i.toString().padStart(2, "0")} 0x${value.toString(16).padStart(4, "0")} rgba(${r},${g},${b},${a})`);
  }
  return {
    entries,
    transparent,
    opaque: entries - transparent,
    uniqueColours: colours.size,
    firstEntries,
    warnings
  };
}
