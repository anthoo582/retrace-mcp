import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok } from "../core/evidence.js";
import { writeFileGuarded, resolveInWorkspace } from "../security/paths.js";
import { registerTool } from "./helpers.js";
import { buildPortPlan, translateMipsBinary, validateTranslation } from "../port/porting.js";

const platform = z.enum(["n64", "ps2"]);

export function registerPortTools(server: McpServer): void {
  registerTool(server, "port_project_plan", "Build an evidence-driven N64/PS2 porting plan with ISA, ABI, runtime, asset and validation gates.", {
    sourcePlatform: platform,
    targetPlatform: platform
  }, async ({ sourcePlatform, targetPlatform }) => ok(buildPortPlan(sourcePlatform, targetPlatform)));

  registerTool(server, "binary_translate", "Translate encoding-preserving MIPS words between N64 and PS2 endian representations. Refuses console-specific instructions unless explicitly allowed.", {
    hex: z.string().describe("MIPS instruction words as hexadecimal bytes"),
    sourcePlatform: platform,
    targetPlatform: platform,
    allowUnsupported: z.boolean().optional().describe("Emit a review-only artifact despite unsupported words"),
    outputPath: z.string().optional().describe("Optional workspace path for a generated .bin artifact"),
    apply: z.boolean().optional().describe("Must be true plus RETRACE_ALLOW_WRITE=1 to write outputPath")
  }, async ({ hex, sourcePlatform, targetPlatform, allowUnsupported, outputPath, apply }) => {
    const clean = hex.replace(/\s+/g, "");
    if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2 !== 0) throw new Error("hex must contain an even number of hexadecimal digits.");
    const report = translateMipsBinary(Buffer.from(clean, "hex"), { sourcePlatform, targetPlatform, allowUnsupported });
    let written = false;
    if (outputPath) {
      const fullPath = resolveInWorkspace(outputPath, false);
      const result = await writeFileGuarded(fullPath, Buffer.from(report.translatedHex, "hex"), apply === true);
      written = result.written;
    }
    return ok({ ...report, written });
  });

  registerTool(server, "port_validate_translation", "Validate that a supported N64/PS2 encoding translation round-trips exactly; this is not a semantic equivalence proof.", {
    hex: z.string(),
    sourcePlatform: platform,
    targetPlatform: platform
  }, async ({ hex, sourcePlatform, targetPlatform }) => ok(validateTranslation(hex, sourcePlatform, targetPlatform)));
}
