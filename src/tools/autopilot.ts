import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { detectAdapters } from "../adapters/registry.js";
import { ok } from "../core/evidence.js";
import { N64Rom } from "../parsers/n64rom.js";
import { readFileCapped, resolveInWorkspace, writeFileGuarded } from "../security/paths.js";
import { buildAutopilotPlan, hashState } from "../port/autopilot.js";
import type { RunManifest } from "../port/autopilot.js";
import { VERSION } from "../version.js";
import { registerTool } from "./helpers.js";

function statePath(root: string): string {
  return path.join(root, ".retrace", "project-state.json");
}

async function readState(root: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(statePath(root), "utf8")) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return {};
    throw error;
  }
}

export function registerAutopilotTools(server: McpServer): void {
  registerTool(server, "project_autopilot", "Plan or execute the evidence-driven N64-to-PS2 pipeline. It runs only installed adapters and records blocked stages instead of simulating results.", {
    romPath: z.string(),
    projectRoot: z.string(),
    configPath: z.string().optional(),
    mode: z.enum(["plan", "execute"]).optional(),
    confirm: z.boolean().optional().describe("Required for execute mode"),
    refresh: z.boolean().optional()
  }, async ({ romPath, projectRoot, configPath, mode, confirm, refresh }) => {
    const root = resolveInWorkspace(projectRoot, false);
    const romFile = resolveInWorkspace(romPath);
    const romBytes = await readFileCapped(romFile);
    const rom = N64Rom.fromBuffer(romBytes);
    const configFile = configPath ? resolveInWorkspace(configPath) : undefined;
    const configBytes = configFile ? await readFileCapped(configFile) : undefined;
    const adapters = await detectAdapters(refresh === true);
    const capabilities = Object.fromEntries(adapters.map((adapter) => [adapter.id, adapter.available]));
    const plan = buildAutopilotPlan(capabilities, Boolean(configPath));
    const romSha256 = crypto.createHash("sha256").update(romBytes).digest("hex");
    const configSha256 = configBytes ? crypto.createHash("sha256").update(configBytes).digest("hex") : undefined;
    const manifest: RunManifest = {
      schema: "retrace.run-manifest.v1",
      generatedAt: new Date().toISOString(),
      retraceVersion: VERSION,
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      inputs: [{ path: romFile, sha256: romSha256, kind: "n64-rom" }, ...(configFile && configSha256 ? [{ path: configFile, sha256: configSha256, kind: "pipeline-config" }] : [])],
      tools: adapters.map(({ id, command, available, version }) => ({ id, command, available, version })),
      configuration: { projectRoot: root, ...(configFile ? { configPath: configFile, configSha256 } : {}) },
      commands: [],
      artifacts: [],
      evidence: ["Input hashes were calculated from bytes read under the configured workspace root."],
      warnings: [],
      limitations: ["The manifest records gates and provenance; it does not claim a successful port or gameplay equivalence."]
    };
    const state = { schema: "retrace.project-state.v1", updatedAt: manifest.generatedAt, root, romPath, romSha256, rom: { format: rom.format, header: rom.header, checksum: rom.checksum }, capabilities, plan, manifest };
    if (mode !== "execute") return ok({ mode: "plan", ...state, write: { performed: false, path: statePath(root) } });
    if (!confirm) throw new Error("Set confirm=true before executing the autopilot pipeline.");
    const target = statePath(root);
    const written = await writeFileGuarded(target, JSON.stringify(state, null, 2), true);
    return ok({ mode: "execute", ...state, write: { performed: written.written, path: written.path }, note: "Autopilot records and gates the pipeline; each external stage must still pass its adapter and human-safety contract." });
  });

  registerTool(server, "project_state", "Read or persist the reproducible project manifest used by the N64-to-PS2 autopilot.", {
    action: z.enum(["read", "write"]),
    projectRoot: z.string(),
    state: z.record(z.string(), z.any()).optional(),
    confirm: z.boolean().optional()
  }, async ({ action, projectRoot, state, confirm }) => {
    const root = resolveInWorkspace(projectRoot, false);
    if (action === "read") return ok({ path: statePath(root), state: await readState(root) });
    if (!confirm) throw new Error("Set confirm=true before writing project state.");
    if (!state) throw new Error("state is required for action=write.");
    const payload = { ...state, updatedAt: new Date().toISOString() };
    const written = await writeFileGuarded(statePath(root), JSON.stringify(payload, null, 2), true);
    return ok({ path: written.path, written: written.written, hash: hashState(payload) });
  });
}
