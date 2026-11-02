import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import { resolveInWorkspace, readFileCapped } from "../security/paths.js";
import {
  detectRomFormat,
  normalizeToBigEndian,
  parseHeader,
  findCodeRegions,
  diffRoms,
  extractAsciiStrings
} from "../parsers/n64rom.js";
import { ok } from "../core/evidence.js";

export function registerRomTools(server: McpServer): void {
  registerTool(
    server,
    "rom_inspect",
    "Inspect an N64 ROM file: detects byte-order format (.z64, .v64, .n64), parses header, entry point, CRC and ROM name.",
    {
      path: z.string().describe("Path to ROM file in workspace")
    },
    async ({ path: filePath }) => {
      const fullPath = resolveInWorkspace(filePath);
      const buffer = await readFileCapped(fullPath, 0, 0x1000);
      const format = detectRomFormat(buffer);
      const normalized = normalizeToBigEndian(buffer, format.byteOrder);
      const header = parseHeader(normalized);
      return ok({
        file: filePath,
        format,
        header
      });
    }
  );

  registerTool(
    server,
    "rom_identify_format",
    "Identify byte-order format of an N64 ROM without reading entire file.",
    {
      path: z.string().describe("Path to ROM file in workspace")
    },
    async ({ path: filePath }) => {
      const fullPath = resolveInWorkspace(filePath);
      const buffer = await readFileCapped(fullPath, 0, 4);
      const format = detectRomFormat(buffer);
      return ok({ file: filePath, format });
    }
  );

  registerTool(
    server,
    "rom_find_code_regions",
    "Scan an N64 ROM for executable MIPS code regions using prologue patterns.",
    {
      path: z.string().describe("Path to ROM file"),
      maxBytes: z.number().optional().describe("Max bytes to scan (default 4MB)")
    },
    async ({ path: filePath, maxBytes }) => {
      const fullPath = resolveInWorkspace(filePath);
      const limit = maxBytes ?? 4 * 1024 * 1024;
      const buffer = await readFileCapped(fullPath, 0, limit);
      const format = detectRomFormat(buffer.subarray(0, 4));
      const normalized = normalizeToBigEndian(buffer, format.byteOrder);
      const regions = findCodeRegions(normalized);
      return ok({ file: filePath, regions });
    }
  );

  registerTool(
    server,
    "rom_compare",
    "Compare two N64 ROM versions byte-by-byte and report segment differences.",
    {
      pathA: z.string().describe("Path to original ROM"),
      pathB: z.string().describe("Path to modified ROM")
    },
    async ({ pathA, pathB }) => {
      const fullA = resolveInWorkspace(pathA);
      const fullB = resolveInWorkspace(pathB);
      const bufA = await readFileCapped(fullA);
      const bufB = await readFileCapped(fullB);
      const diff = diffRoms(bufA, bufB);
      return ok({ fileA: pathA, fileB: pathB, diff });
    }
  );
}

