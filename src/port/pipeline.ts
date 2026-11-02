import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { detectAdapters, type AdapterStatus } from "../adapters/registry.js";
import { N64Rom } from "../parsers/n64rom.js";
import { readFileCapped, resolveInWorkspace, writeFileGuarded } from "../security/paths.js";
import type { AutopilotPlan } from "./autopilot.js";

export type PortJob = {
  schema: "retrace.port-job.v1";
  id: string;
  createdAt: string;
  updatedAt: string;
  source: { path: string; sha256: string; format: string; region?: string };
  target: "ps2";
  projectRoot: string;
  profile: string;
  adapters: AdapterStatus[];
  plan: AutopilotPlan;
  artifacts: Array<{ path: string; sha256: string; kind: string }>;
  status: "planned" | "running" | "blocked" | "validated";
};

export function jobPath(projectRoot: string): string {
  return path.join(projectRoot, ".retrace", "port-job.json");
}

export async function readPortJob(projectRoot: string): Promise<PortJob | null> {
  try {
    return JSON.parse(await fs.readFile(jobPath(projectRoot), "utf8")) as PortJob;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function createPortJob(input: { romPath: string; projectRoot: string; profile?: string }): Promise<PortJob> {
  const projectRoot = resolveInWorkspace(input.projectRoot, false);
  const romPath = resolveInWorkspace(input.romPath);
  const bytes = await readFileCapped(romPath);
  const rom = N64Rom.fromBuffer(bytes);
  const adapters = await detectAdapters();
  const capabilities = Object.fromEntries(adapters.map((adapter) => [adapter.id, adapter.available]));
  const { buildAutopilotPlan } = await import("./autopilot.js");
  const plan = buildAutopilotPlan(capabilities, Boolean(input.profile));
  const now = new Date().toISOString();
  return {
    schema: "retrace.port-job.v1",
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    source: {
      path: romPath,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      format: rom.format.description,
      region: rom.header.countryName
    },
    target: "ps2",
    projectRoot,
    profile: input.profile ?? "auto",
    adapters,
    plan,
    artifacts: [],
    status: plan.blocked.length > 0 ? "blocked" : "planned"
  };
}

export async function persistPortJob(job: PortJob, apply: boolean): Promise<string> {
  const target = jobPath(job.projectRoot);
  const updated = { ...job, updatedAt: new Date().toISOString() };
  const written = await writeFileGuarded(target, JSON.stringify(updated, null, 2), apply);
  return written.path;
}

export async function hashArtifact(filePath: string): Promise<string> {
  const bytes = await fs.readFile(resolveInWorkspace(filePath));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export async function writeSystemCnf(root: string, elfName: string, apply: boolean): Promise<string> {
  const target = path.join(resolveInWorkspace(root, false), "SYSTEM.CNF");
  const content = `BOOT2 = cdrom0:\\${elfName};1\nVER = 1.00\nVMODE = NTSC\nHVMODE = NTSC\n\n`;
  const written = await writeFileGuarded(target, content, apply);
  return written.path;
}

export function findAdapter(adapters: AdapterStatus[], ids: string[]): AdapterStatus | undefined {
  return ids.map((id) => adapters.find((adapter) => adapter.id === id)).find((adapter) => adapter?.available);
}

export const pipelineRoot = config.workspaceRoots[0] ?? process.cwd();
