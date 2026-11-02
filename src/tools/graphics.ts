import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import {
  decodeN64Texture,
  decodeRgba16,
  decodeRgba32,
  analyzePalette,
  ps2LinearToRgba,
  n64TextureInfo,
  Ps2Psm
} from "../graphics/texture.js";
import { decodeGsTexture, type GsPsm } from "../graphics/ps2.js";
import { ok } from "../core/evidence.js";

export function registerGraphicsTools(server: McpServer): void {
  registerTool(
    server,
    "texture_inspect",
    "Calculate N64 texture metadata (format, size, required buffer bytes, completeness) based on format code, size code, width and height.",
    {
      formatCode: z.number().describe("0=RGBA, 1=YUV, 2=CI, 3=IA, 4=I"),
      sizeCode: z.number().describe("0=4-bit, 1=8-bit, 2=16-bit, 3=32-bit"),
      width: z.number().describe("Texture width in texels"),
      height: z.number().describe("Texture height in texels"),
      availableBytes: z.number().describe("Number of bytes in source buffer"),
      paletteEntries: z.number().optional().describe("For CI textures, number of palette colors")
    },
    async ({ formatCode, sizeCode, width, height, availableBytes, paletteEntries }) => {
      const info = n64TextureInfo(formatCode, sizeCode, width, height, availableBytes, paletteEntries);
      return ok(info);
    }
  );

  registerTool(
    server,
    "texture_analyze_palette",
    "Analyze an N64 TLUT palette buffer: count transparent vs opaque colors, unique colors, and hex values.",
    {
      hex: z.string().describe("Hex representation of palette data (RGBA16 entries)"),
      endian: z.enum(["big", "little"]).optional().describe("Endianness (default big for N64)")
    },
    async ({ hex, endian }) => {
      const buffer = Buffer.from(hex.replace(/[^0-9a-fA-F]/g, ""), "hex");
      const report = analyzePalette(buffer, endian ?? "big");
      return ok(report);
    }
  );

  registerTool(
    server,
    "texture_decode_n64",
    "Decode raw N64 texture data into RGBA pixels and PNG image.",
    {
      format: z.enum(["RGBA", "CI", "IA", "I"]).describe("N64 texture format"),
      size: z.enum(["4", "8", "16", "32"]).describe("Bit depth per texel"),
      width: z.number().describe("Width in pixels"),
      height: z.number().describe("Height in pixels"),
      dataHex: z.string().describe("Hex data of texture"),
      paletteHex: z.string().optional().describe("Hex data of palette (required for CI)")
    },
    async ({ format, size, width, height, dataHex, paletteHex }) => {
      const data = Buffer.from(dataHex.replace(/[^0-9a-fA-F]/g, ""), "hex");
      const palette = paletteHex ? Buffer.from(paletteHex.replace(/[^0-9a-fA-F]/g, ""), "hex") : undefined;
      const bitDepth = Number.parseInt(size, 10) as 4 | 8 | 16 | 32;
      const decoded = decodeN64Texture({
        format,
        size: bitDepth,
        width,
        height,
        data,
        palette
      });
      return ok({
        format,
        size: bitDepth,
        width,
        height,
        pixelCount: decoded.pixels.length,
        pngBase64: decoded.png.toString("base64"),
        warnings: decoded.warnings
      });
    }
  );

  registerTool(
    server,
    "texture_decode_ps2",
    "Decode a PS2 GS texture (PSMCT32/16/16S, PSMT8/4) from swizzled or linear data, optionally with a CSM2 CLUT, into RGBA and PNG.",
    {
      psm: z.enum(["PSMCT32", "PSMCT16", "PSMCT16S", "PSMT8", "PSMT4", "PSMZ32", "PSMZ16", "PSMZ16S"]),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      dataHex: z.string().describe("Texture bytes as hex"),
      swizzled: z.boolean().optional().describe("Treat input as GS VRAM (default true)"),
      clutHex: z.string().optional().describe("32-bit RGBA CLUT entries as hex (required for PSMT8/PSMT4)"),
      clutStorage: z.enum(["CSM1", "CSM2"]).optional().describe("CLUT storage mode (default CSM2; CSM1 is refused)")
    },
    async ({ psm, width, height, dataHex, swizzled, clutHex, clutStorage }) => {
      const data = Buffer.from(dataHex.replace(/[^0-9a-fA-F]/g, ""), "hex");
      const clut = clutHex
        ? { entries: Buffer.from(clutHex.replace(/[^0-9a-fA-F]/g, ""), "hex"), storage: (clutStorage ?? "CSM2") as "CSM1" | "CSM2" }
        : undefined;
      const decoded = decodeGsTexture({ psm: psm as GsPsm, width, height, data, swizzled, clut });
      return ok({
        psm,
        width,
        height,
        layout: decoded.layout,
        pixelCount: decoded.pixels.length,
        pngBase64: decoded.png.toString("base64"),
        warnings: decoded.warnings,
        limitations: decoded.limitations
      });
    }
  );
}

