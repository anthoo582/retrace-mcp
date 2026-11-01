import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import { inspectAudio, decodeVagAdpcm } from "../audio/formats.js";
import { resolveInWorkspace, readFileCapped } from "../security/paths.js";
import { ok } from "../core/evidence.js";

export function registerAudioTools(server: McpServer): void {
  registerTool(
    server,
    "audio_inspect",
    "Inspect an audio asset file (PS2 VAG, N64 bank, or raw ADPCM) to detect sample rate, channels, and compression.",
    {
      path: z.string().describe("Path to audio file in workspace")
    },
    async ({ path: filePath }) => {
      const fullPath = resolveInWorkspace(filePath);
      const buffer = await readFileCapped(fullPath, 0, 0x1000);
      const info = inspectAudio(buffer);
      return ok({ file: filePath, audioInfo: info });
    }
  );

  registerTool(
    server,
    "audio_decode_vag_block",
    "Decode a 16-byte Sony PS2 VAG ADPCM block into 28 linear 16-bit PCM samples.",
    {
      hex: z.string().describe("Hex data of 16-byte VAG block")
    },
    async ({ hex }) => {
      const block = Buffer.from(hex.replace(/[^0-9a-fA-F]/g, ""), "hex");
      if (block.length < 16) throw new Error("VAG block must be at least 16 bytes");
      const samples = decodeVagAdpcm(block);
      return ok({ sampleCount: samples.length, samples });
    }
  );
}
