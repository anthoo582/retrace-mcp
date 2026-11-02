import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import { inspectAudio, decodeVagAdpcm } from "../audio/formats.js";
import { decodeVagFile, decodeN64Aifc, audioToWav } from "../audio/decode.js";
import { resolveInWorkspace, readFileCapped, writeFileGuarded } from "../security/paths.js";
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

  registerTool(
    server,
    "audio_decode_file",
    "Decode a PS2 VAG/VAGi or N64 AIFC VADPCM file to 16-bit PCM WAV. N64 decoding requires the file's own VADPCMCODES codebook and refuses to invent one.",
    {
      path: z.string().describe("Audio file in the workspace"),
      format: z.enum(["auto", "vag", "n64-vadpcm"]).optional().describe("Force a decoder (default auto)"),
      outPath: z.string().optional().describe("Optional WAV output path in the workspace"),
      apply: z.boolean().optional().describe("Set true to write outPath; requires RETRACE_ALLOW_WRITE=1")
    },
    async ({ path: filePath, format, outPath, apply }) => {
      const fullPath = resolveInWorkspace(filePath);
      const buffer = await readFileCapped(fullPath);
      const detected = format ?? (buffer.toString("ascii", 0, 4) === "FORM" ? "n64-vadpcm" : "vag");
      const decoded = detected === "n64-vadpcm" ? decodeN64Aifc(buffer) : decodeVagFile(buffer);
      const wav = audioToWav(decoded);
      let written: { written: boolean; path: string } | undefined;
      if (outPath) {
        if (!apply) throw new Error("outPath requires apply=true; no file was written.");
        const target = resolveInWorkspace(outPath, false);
        written = await writeFileGuarded(target, wav.buffer, true);
      }
      return ok({
        file: filePath,
        format: decoded.format,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        samples: decoded.samples.length,
        durationSeconds: Number(decoded.durationSeconds.toFixed(4)),
        wavBase64: wav.buffer.toString("base64"),
        written,
        notes: decoded.notes,
        limitations: decoded.limitations
      });
    }
  );
}
