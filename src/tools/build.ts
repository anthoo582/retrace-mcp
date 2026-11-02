import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { analyzeBuild } from "../build/analysis.js";
import { ALLOWED_BUILD_COMMANDS, runBuild, type AllowedBuildCommand } from "../build/run.js";
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

  registerTool(
    server,
    "build_run",
    "Run one allowlisted build command with shell:false, a workspace-bound cwd, a timeout and no shell metacharacters. Requires RETRACE_ALLOW_WRITE=1 and confirm=true.",
    {
      command: z.enum(ALLOWED_BUILD_COMMANDS).describe("Allowlisted build tool"),
      args: z.array(z.string()).max(64).optional().describe("Arguments; restricted to a safe character set"),
      cwd: z.string().optional().describe("Working directory inside the workspace"),
      timeoutMs: z.number().int().positive().max(600000).optional(),
      confirm: z.boolean().describe("Must be true; running a build is an explicit act")
    },
    async ({ command, args, cwd, timeoutMs, confirm }) => {
      if (!confirm) throw new Error("Set confirm=true to run a build.");
      const result = await runBuild({ command: command as AllowedBuildCommand, args, cwd, timeoutMs });
      return ok(result);
    }
  );
}
