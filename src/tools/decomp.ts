import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import {
  inspectDecompConfig,
  validateDecompConfig,
  proposeConfigChange,
  applyConfigChange
} from "../config/decomp.js";
import { resolveInWorkspace } from "../security/paths.js";
import { ok } from "../core/evidence.js";

export function registerDecompTools(server: McpServer): void {
  registerTool(
    server,
    "decomp_config_inspect",
    "Inspect a decompilation configuration file (YAML, JSON, splat) for functions, segments, and symbols.",
    {
      path: z.string().describe("Path to configuration file")
    },
    async ({ path: filePath }) => {
      const fullPath = resolveInWorkspace(filePath);
      const info = await inspectDecompConfig(fullPath);
      return ok({ file: filePath, info });
    }
  );

  registerTool(
    server,
    "decomp_config_validate",
    "Validate the syntax and structure of a decompilation configuration file.",
    {
      path: z.string().describe("Path to configuration file")
    },
    async ({ path: filePath }) => {
      const fullPath = resolveInWorkspace(filePath);
      const report = await validateDecompConfig(fullPath);
      return ok({ file: filePath, report });
    }
  );

  registerTool(
    server,
    "decomp_config_propose_changes",
    "Prepare a safe proposed modification to a decompilation config and inspect the unified diff before applying.",
    {
      path: z.string().describe("Path to configuration file"),
      symbolName: z.string().describe("Symbol name to update or add"),
      address: z.string().describe("Address or value in hex (e.g. 0x80000400)")
    },
    async ({ path: filePath, symbolName, address }) => {
      const proposal = await proposeConfigChange(filePath, (doc) => {
        const next = { ...doc };
        const symbols = (next.symbols && typeof next.symbols === "object" ? { ...next.symbols } : {}) as Record<string, unknown>;
        symbols[symbolName] = address;
        next.symbols = symbols;
        return next;
      });
      return ok({ file: filePath, proposal });
    }
  );

  registerTool(
    server,
    "decomp_config_apply_changes",
    "Apply an approved modification proposal to a decompilation configuration file. Requires RETRACE_ALLOW_WRITE=1.",
    {
      path: z.string().describe("Path to configuration file"),
      symbolName: z.string().describe("Symbol name to update or add"),
      address: z.string().describe("Address or value in hex"),
      apply: z.boolean().describe("Set true to confirm writing changes")
    },
    async ({ path: filePath, symbolName, address, apply }) => {
      const proposal = await proposeConfigChange(filePath, (doc) => {
        const next = { ...doc };
        const symbols = (next.symbols && typeof next.symbols === "object" ? { ...next.symbols } : {}) as Record<string, unknown>;
        symbols[symbolName] = address;
        next.symbols = symbols;
        return next;
      });
      const result = await applyConfigChange(proposal, { apply, backup: true });
      return ok({ file: filePath, result });
    }
  );
}
