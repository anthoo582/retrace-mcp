import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { disassemble, type MipsArch } from "../mips/disasm.js";
import { inferStructs, inferVariables, validateVariableMap, type VariableCandidate } from "../port/variables.js";
import { ok } from "../core/evidence.js";
import { registerTool } from "./helpers.js";

async function variablesFromHex(hex: string, address: number, arch: MipsArch) {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  if (!clean || clean.length % 8 !== 0) throw new Error("hex must contain complete 32-bit MIPS instructions.");
  const endian = arch === "r4300i" ? "big" : "little";
  const result = await disassemble(Buffer.from(clean, "hex"), address, { arch, endian });
  return inferVariables(result.instructions);
}

const input = {
  hex: z.string(),
  address: z.number().optional(),
  arch: z.enum(["r4300i", "r5900"]).optional()
};

export function registerVariableTools(server: McpServer): void {
  registerTool(server, "infer_variables", "Infer stack locals, globals, arguments, returns and register roles from MIPS dataflow observations. Results are candidates with evidence, not automatic source edits.", input, async ({ hex, address, arch }) => {
    const variables = await variablesFromHex(hex, address ?? (arch === "r5900" ? 0x00100000 : 0x80000400), (arch ?? "r4300i") as MipsArch);
    return ok({ variables, status: "candidate", limitations: ["Type inference is heuristic and must be checked against callers, xrefs and runtime traces."] });
  });

  registerTool(server, "infer_structs", "Group repeated base-register offsets into candidate structs and fields for N64-to-PS2 variable translation.", input, async ({ hex, address, arch }) => {
    const variables = await variablesFromHex(hex, address ?? (arch === "r5900" ? 0x00100000 : 0x80000400), (arch ?? "r4300i") as MipsArch);
    return ok({ structs: inferStructs(variables), variables, status: "candidate" });
  });

  registerTool(server, "suggest_variable_names", "Return evidence-ranked names for inferred variables without modifying source files.", {
    variables: z.array(z.object({ key: z.string(), name: z.string(), suggestions: z.array(z.string()), kind: z.string(), storage: z.string(), type: z.string(), width: z.number(), confidence: z.enum(["high", "medium", "low"]), evidence: z.array(z.string()), offset: z.number().optional() })),
    context: z.string().optional()
  }, async ({ variables, context }) => ok({ context, suggestions: variables.map((variable) => ({ key: variable.key, current: variable.name, proposed: variable.suggestions, confidence: variable.confidence, reason: variable.evidence.slice(0, 3) })) }));

  registerTool(server, "validate_variable_map", "Validate inferred variable names, offsets, widths and conflicting observations before an ABI translation is reviewed.", {
    variables: z.array(z.object({ key: z.string(), name: z.string(), suggestions: z.array(z.string()), kind: z.string(), storage: z.string(), type: z.string(), width: z.number(), confidence: z.enum(["high", "medium", "low"]), evidence: z.array(z.string()), offset: z.number().optional() }))
  }, async ({ variables }) => ok(validateVariableMap(variables as VariableCandidate[])));
}
