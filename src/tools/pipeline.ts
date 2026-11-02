import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { detectAdapters } from "../adapters/registry.js";
import { execFile } from "../core/exec.js";
import { ok } from "../core/evidence.js";
import { hashArtifact, createPortJob, findAdapter, jobPath, persistPortJob, readPortJob, writeSystemCnf } from "../port/pipeline.js";
import { readFileCapped, requireWriteAccess, resolveInWorkspace, writeFileGuarded } from "../security/paths.js";
import { registerTool } from "./helpers.js";

async function listSourceFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > 8 || result.length >= 5000) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".retrace") continue;
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(target, depth + 1);
      else if (/\.(c|cc|cpp|h|hpp|s|S|inc|json|yaml|yml|toml|mk|txt)$/i.test(entry.name)) result.push(path.relative(root, target));
    }
  };
  await visit(root, 0);
  return result.sort();
}

export function isoListingHasBootFiles(listing: string): boolean {
  const normalized = listing.toUpperCase();
  return normalized.includes("SYSTEM.CNF") && normalized.includes("BOOT.ELF");
}

export function registerPipelineTools(server: McpServer): void {
  registerTool(server, "port_start", "Create a resumable, evidence-driven N64-to-PS2 port job. It preserves the ROM and never claims a port before validation.", {
    romPath: z.string(),
    projectRoot: z.string(),
    profile: z.string().optional(),
    confirm: z.boolean().optional()
  }, async ({ romPath, projectRoot, profile, confirm }) => {
    const job = await createPortJob({ romPath, projectRoot, profile });
    if (!confirm) return ok({ job, persisted: false, note: "Set confirm=true to persist the resumable job. External tools remain individually gated." });
    requireWriteAccess(job.projectRoot, true);
    const persistedPath = await persistPortJob(job, true);
    return ok({ job, persisted: true, path: persistedPath });
  });

  registerTool(server, "port_status", "Read the last persisted port job, including blocked stages, tool versions, artifacts and source provenance.", {
    projectRoot: z.string()
  }, async ({ projectRoot }) => {
    const root = resolveInWorkspace(projectRoot, false);
    const job = await readPortJob(root);
    if (!job) return ok({ status: "missing", path: jobPath(root), next: "Call port_start with an authorized ROM." });
    return ok({ status: job.status, job });
  });

  registerTool(server, "port_source_manifest", "Verify that a port project contains inspectable generated source, translated variables and provenance before packaging an ISO.", {
    projectRoot: z.string(),
    sourceDir: z.string().optional()
  }, async ({ projectRoot, sourceDir }) => {
    const root = resolveInWorkspace(projectRoot, false);
    const sourceRoot = resolveInWorkspace(sourceDir ?? path.join(root, "src"), false);
    const files = await listSourceFiles(sourceRoot).catch(() => []);
    const variableCandidates = ["variables.json", "symbols.json", "variable-map.json"].filter((name) => fsSync.existsSync(path.join(root, name)));
    const sourceFiles = files.filter((file) => /\.(c|cc|cpp|h|hpp|s|S|inc)$/i.test(file));
    const complete = sourceFiles.length > 0 && variableCandidates.length > 0;
    return ok({ complete, sourceRoot, sourceFiles: sourceFiles.length, files, translatedVariableMaps: variableCandidates, reason: complete ? undefined : "Generated source and a translated variable map are required before ISO packaging." });
  });

  registerTool(server, "package_ps2_iso", "Build a PS2 ISO from an authorized ELF and project tree using mkisofs/genisoimage. The source tree and SYSTEM.CNF remain in the project.", {
    projectRoot: z.string(),
    elfPath: z.string(),
    outputIso: z.string(),
    confirm: z.boolean()
  }, async ({ projectRoot, elfPath, outputIso, confirm }) => {
    const root = resolveInWorkspace(projectRoot, false);
    const elf = resolveInWorkspace(elfPath);
    const iso = resolveInWorkspace(outputIso, false);
    if (!confirm) return ok({ planned: true, projectRoot: root, elfPath: elf, outputIso: iso, note: "Set confirm=true to create the ISO." });
    requireWriteAccess(root, true);
    requireWriteAccess(iso, true);
    const adapter = findAdapter(await detectAdapters(true), ["mkisofs", "genisoimage"]);
    if (!adapter) throw new Error("No ISO builder is installed. Install mkisofs or genisoimage; no ISO was simulated.");
    const boot = path.join(root, "BOOT.ELF");
    await fs.copyFile(elf, boot);
    await writeSystemCnf(root, "BOOT.ELF", true);
    const result = await execFile(adapter.command, ["-o", iso, "-V", "RETRACE_PS2", "-R", "-J", root], { cwd: root, timeoutMs: 600000, maxBytes: 16 * 1024 * 1024 });
    if (result.code !== 0) throw new Error(`${adapter.id} failed with exit ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`);
    const bytes = await readFileCapped(iso);
    const job = await readPortJob(root);
    if (job) {
      job.artifacts = [...job.artifacts.filter((artifact) => artifact.path !== iso), { path: iso, sha256: await hashArtifact(iso), kind: "ps2-iso" }];
      job.status = "running";
      await persistPortJob(job, true);
    }
    return ok({ status: "created", iso, bytes: bytes.length, sha256: await hashArtifact(iso), adapter: adapter.id, command: result.command, args: result.args, sourcePreserved: true, validation: "not_claimed_until_pcsx2_boot_and_input_replay" });
  });

  registerTool(server, "iso_verify", "Verify a PS2 ISO with an installed ISO reader and confirm that SYSTEM.CNF and BOOT.ELF are present. This is a filesystem gate, not a gameplay claim.", {
    isoPath: z.string(),
    expectedSha256: z.string().length(64).optional()
  }, async ({ isoPath, expectedSha256 }) => {
    const iso = resolveInWorkspace(isoPath);
    const adapters = await detectAdapters(true);
    const reader = findAdapter(adapters, ["isoinfo", "7z"]);
    if (!reader) throw new Error("No ISO reader is installed. Install isoinfo or 7z; ISO contents were not simulated.");
    const args = reader.id === "isoinfo" ? ["-i", iso, "-f"] : ["l", iso];
    const result = await execFile(reader.command, args, { timeoutMs: 120000, maxBytes: 16 * 1024 * 1024 });
    if (result.code !== 0) throw new Error(`${reader.id} failed with exit ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`);
    const sha256 = await hashArtifact(iso);
    const bootFiles = isoListingHasBootFiles(result.stdout);
    const hashMatches = expectedSha256 === undefined || expectedSha256.toLowerCase() === sha256;
    return ok({ iso, sha256, hashMatches, bootFiles, reader: reader.id, status: bootFiles && hashMatches ? "filesystem_verified" : "verification_failed", gameplay: "not_claimed" });
  });
}
