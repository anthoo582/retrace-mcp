#!/usr/bin/env node
import { detectAdapters } from "../dist/adapters/registry.js";
import { config } from "../dist/config.js";
import fs from "node:fs/promises";
import { execFile } from "../dist/core/exec.js";

async function main() {
  console.log("=== Retrace MCP System Diagnostic Probe ===");
  console.log(`Node: ${process.version} (${process.platform}/${process.arch})`);
  console.log(`Workspace roots: ${config.workspaceRoots.join(", ")}`);
  console.log(`Data directory: ${config.dataDir}`);
  console.log(`Write access enabled: ${config.allowWrite}`);
  console.log(`Limits: MaxFileBytes=${config.maxFileBytes}, MaxScanFiles=${config.maxScanFiles}, Timeout=${config.commandTimeoutMs}ms`);

  const git = await execFile("git", ["--version"]).catch(() => null);
  console.log(`Git: ${git?.code === 0 ? git.stdout.trim() : "unavailable"}`);

  console.log("\nExternal Analyzers & Toolchains:");
  const adapters = await detectAdapters(true);
  for (const a of adapters) {
    const icon = a.available ? "[OK]" : "[--]";
    const ver = a.version ? ` (${a.version})` : "";
    console.log(`  ${icon} ${a.id.padEnd(14)}: ${a.purpose}${ver}`);
  }

  const availableCount = adapters.filter((a) => a.available).length;
  console.log(`\nAvailable adapters: ${availableCount}/${adapters.length}`);
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(1);
});

