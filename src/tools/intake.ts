import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { detectAdapters, type AdapterStatus } from "../adapters/registry.js";
import { ok } from "../core/evidence.js";
import { analyzeBuild } from "../build/analysis.js";
import { N64Rom } from "../parsers/n64rom.js";
import { readFileCapped, resolveInWorkspace } from "../security/paths.js";
import { registerTool } from "./helpers.js";

const platform = z.enum(["n64", "ps2"]);

async function sha256(buffer: Buffer): Promise<string> {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function availability(adapters: AdapterStatus[], ids: string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map((id) => [id, adapters.some((adapter) => adapter.id === id && adapter.available)]));
}

export function registerIntakeTools(server: McpServer): void {
  registerTool(server, "project_intake", "Create a read-only, reproducible intake record for an authorized N64 to PS2 port project.", {
    name: z.string().min(1).max(120),
    sourcePlatform: platform,
    targetPlatform: platform,
    rightsConfirmed: z.boolean().describe("Confirm that the caller is authorized to analyze supplied binaries/assets"),
    romPath: z.string().optional().describe("Optional local N64 ROM path; bytes are read only for metadata and hashing"),
    root: z.string().optional().describe("Workspace project root")
  }, async ({ name, sourcePlatform, targetPlatform, rightsConfirmed, romPath, root }) => {
    if (!rightsConfirmed) throw new Error("Set rightsConfirmed=true before analyzing a game binary or its assets.");
    const workspace = resolveInWorkspace(root ?? config.workspaceRoots[0] ?? process.cwd());
    const build = await analyzeBuild(workspace);
    let source: Record<string, unknown> = { kind: "not_supplied" };
    if (romPath) {
      const fullPath = resolveInWorkspace(romPath);
      const bytes = await readFileCapped(fullPath);
      const rom = N64Rom.fromBuffer(bytes);
      source = { kind: "n64_rom", path: romPath, bytes: bytes.length, sha256: await sha256(bytes), format: rom.format, header: rom.header, checksum: rom.checksum };
    }
    return ok({
      schema: "retrace.project-intake.v1",
      name,
      sourcePlatform,
      targetPlatform,
      workspace,
      source,
      build,
      policy: { readOnly: true, originalBinariesPreserved: true, rightsConfirmed, noRomOrBiosDistribution: true }
    });
  });

  registerTool(server, "rom_validate", "Validate a local N64 ROM header, byte order, checksum metadata and hash without copying or modifying it.", {
    path: z.string().describe("Local ROM path inside the configured workspace"),
    requireChecksum: z.boolean().optional().describe("Fail when the N64 boot checksum does not match")
  }, async ({ path: filePath, requireChecksum }) => {
    const fullPath = resolveInWorkspace(filePath);
    const bytes = await readFileCapped(fullPath);
    const rom = N64Rom.fromBuffer(bytes);
    if (requireChecksum === true && rom.checksum && !rom.checksum.matches) throw new Error("N64 boot checksum mismatch; image may be patched, hacked or corrupted.");
    return ok({
      path: filePath,
      bytes: bytes.length,
      sha256: await sha256(bytes),
      format: rom.format,
      header: rom.header,
      checksum: rom.checksum,
      policy: { readOnly: true, copied: false, modified: false }
    });
  });

  registerTool(server, "toolchain_probe", "Probe optional N64 reversing and PS2 development tools and report which automated stages are actually available.", {
    refresh: z.boolean().optional(),
    sourcePlatform: platform.optional(),
    targetPlatform: platform.optional()
  }, async ({ refresh, sourcePlatform, targetPlatform }) => {
    const adapters = await detectAdapters(refresh === true);
    const n64 = availability(adapters, ["capstone", "splat", "n64recomp", "m2c", "asm-differ", "ghidra", "radare2"]);
    const ps2 = availability(adapters, ["ps2-gcc", "ps2-objdump", "ps2client", "ps2-packer", "pcsx2", "make", "cmake"]);
    const required = [...(sourcePlatform === "n64" ? ["capstone"] : []), ...(targetPlatform === "ps2" ? ["ps2-gcc", "ps2-objdump"] : [])];
    const missingRequired = required.filter((id) => !adapters.some((adapter) => adapter.id === id && adapter.available));
    return ok({
      sourcePlatform: sourcePlatform ?? "n64",
      targetPlatform: targetPlatform ?? "ps2",
      adapters,
      capabilities: { n64, ps2 },
      gates: { required, missingRequired, readyForRequestedTarget: missingRequired.length === 0 },
      policy: { noDownload: true, noFallbackSimulation: true, noRomBiosIsoAcquisition: true }
    });
  });
}
