import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config.js";
import { detectAdapters } from "../adapters/registry.js";
import { ok } from "../core/evidence.js";
import { execFile } from "../core/exec.js";
import { resolveInWorkspace } from "../security/paths.js";
import { registerTool } from "./helpers.js";

const SKILLS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../..", "skills");

async function skillsRoot(): Promise<string> {
  const candidates = [
    path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../..", "skills"),
    path.resolve(process.cwd(), "skills")
  ];
  for (const candidate of candidates) {
    try {
      await fs.stat(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return SKILLS_DIR;
}

export function registerSystemTools(server: McpServer): void {
  registerTool(
    server,
    "retrace_probe",
    "Diagnose the Retrace installation: Node version, workspace roots, write policy, external analyzer availability (Capstone, binutils, radare2, Ghidra, PS2 toolchain, emulators) and the number of registered tools. Run this first in any session.",
    { refresh: z.boolean().optional().describe("Bypass the adapter cache") },
    async ({ refresh }) => {
      const adapters = await detectAdapters(refresh === true);
      const roots: Array<{ root: string; exists: boolean; writable: boolean }> = [];
      for (const root of config.workspaceRoots) {
        let exists = false;
        try {
          await fs.access(root);
          exists = true;
        } catch {
          exists = false;
        }
        let writable = false;
        if (exists) {
          try {
            await fs.access(root, fs.constants.W_OK);
            writable = true;
          } catch {
            writable = false;
          }
        }
        roots.push({ root, exists, writable });
      }
      const git = await execFile("git", ["--version"], { timeoutMs: 8000 }).catch(() => null);
      return ok({
        version: "0.1.0",
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        transport: config.http ? `stdio + http://${config.http.host}:${config.http.port}${config.http.path}` : "stdio",
        workspaceRoots: roots,
        writeEnabled: config.allowWrite,
        dataDir: config.dataDir,
        limits: { maxFileBytes: config.maxFileBytes, maxScanFiles: config.maxScanFiles, commandTimeoutMs: config.commandTimeoutMs },
        git: git?.code === 0 ? git.stdout.trim() : "unavailable",
        adapters,
        skillsDir: await skillsRoot(),
        ready: roots.some((root) => root.exists)
      });
    }
  );

  registerTool(
    server,
    "retrace_skill_list",
    "List the bundled engineering skills (hardware, reverse engineering, graphics, audio, build/validation) with their purpose and path.",
    {},
    async () => {
      const root = await skillsRoot();
      let entries: string[] = [];
      try {
        entries = await fs.readdir(root, { withFileTypes: true }).then((list) =>
          list.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
        );
      } catch {
        return ok({ skills: [], warning: `Skills directory not found: ${root}` });
      }
      const skills: Array<{ name: string; title: string; purpose: string; path: string }> = [];
      for (const entry of entries) {
        const file = path.join(root, entry, "SKILL.md");
        try {
          const text = await fs.readFile(file, "utf8");
          const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? entry;
          const purpose = /^purpose:\s*(.+)$/im.exec(text)?.[1] ?? "";
          skills.push({ name: entry, title, purpose, path: file });
        } catch {
          continue;
        }
      }
      return ok({ skills });
    }
  );

  registerTool(
    server,
    "retrace_skill_read",
    "Read the full instructions of one bundled skill before performing the matching engineering task.",
    { name: z.string().describe("Skill directory name, e.g. mips-r5900-engineering") },
    async ({ name }) => {
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid skill name");
      const root = await skillsRoot();
      const text = await fs.readFile(path.join(root, name, "SKILL.md"), "utf8");
      return ok({ name, path: path.join(root, name, "SKILL.md"), content: text });
    }
  );

  registerTool(
    server,
    "retrace_limits",
    "Show the active safety limits and the level classification of an operation before doing anything destructive.",
    {},
    async () =>
      ok({
        levels: {
          1: "read: inspect files, binaries, dumps, configs, logs",
          2: "generate: reports, pseudocode, diffs, indexes in .retrace/",
          3: "modify: source, symbols, decomp configs, assets (requires apply=true and write policy)",
          4: "destructive: delete, overwrite ROMs/ELFs, rewrite history (never automated)"
        },
        writeEnabled: config.allowWrite,
        workspaceRoots: config.workspaceRoots,
        note: "Level 4 operations are intentionally not exposed as MCP tools."
      })
  );
}
