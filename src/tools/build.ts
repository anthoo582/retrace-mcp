import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { analyzeBuild } from "../build/analysis.js";
import { ok } from "../core/evidence.js";
import { registerTool } from "./helpers.js";

export function registerBuildTools(server: McpServer): void {
  registerTool(
    server,
    "build_analyze",
    "Inspect real build manifests and report build systems, scripts, targets, toolchain hints and safety warnings without executing commands.",
    { root: z.string().optional().describe("Repository root; defaults to the configured workspace") },
    async ({ root }) => ok(await analyzeBuild(root ?? config.workspaceRoots[0] ?? process.cwd()))
  );
}
