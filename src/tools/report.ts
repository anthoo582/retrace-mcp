import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeReport, ForensicReport } from "../reports/report.js";
import { fail, ok } from "../core/evidence.js";
import { registerTool } from "./helpers.js";
import { config } from "../config.js";

const evidenceSchema = z.object({
  claim: z.string(),
  source: z.string(),
  address: z.string().optional(),
  function: z.string().optional(),
  tool: z.string(),
  result: z.string(),
  confidence: z.enum(["confirmed", "very_likely", "possible", "insufficient"]),
  alternatives: z.array(z.string()).optional()
});

const functionSchema = z.object({
  name: z.string(),
  address: z.string().optional()
});

const addressSchema = z.object({
  label: z.string(),
  address: z.string()
});

const hypothesisSchema = z.object({
  claim: z.string(),
  confidence: z.string(),
  evidence: z.array(z.string()).optional()
});

export function registerReportTools(server: McpServer): void {
  registerTool(
    server,
    "generate_forensic_report",
    "Generate a structured forensic investigation report as Markdown, JSON, or both. The default is read-only; writing files requires RETRACE_ALLOW_WRITE=1 and write=true.",
    {
      title: z.string().describe("Investigation title"),
      conclusion: z.string().describe("Evidence-based conclusion; state uncertainty explicitly"),
      repository: z.string().optional(),
      branch: z.string().optional(),
      build: z.string().optional(),
      architecture: z.string().optional(),
      filesInspected: z.array(z.string()).optional(),
      toolsUsed: z.array(z.string()).optional(),
      evidence: z.array(evidenceSchema).optional(),
      findings: z.array(z.string()).optional(),
      relatedFunctions: z.array(functionSchema).optional(),
      addresses: z.array(addressSchema).optional(),
      hypotheses: z.array(hypothesisSchema).optional(),
      detectedProblems: z.array(z.string()).optional(),
      testsPerformed: z.array(z.string()).optional(),
      proposedFixes: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
      format: z.enum(["markdown", "json", "both"]).optional().describe("Output format; defaults to both"),
      write: z.boolean().optional().describe("Persist under the configured .retrace/reports directory")
    },
    async (args) => {
      if (args.write && !config.allowWrite) {
        return fail(
          "write_denied",
          "Report writing is disabled by RETRACE_ALLOW_WRITE.",
          "Set RETRACE_ALLOW_WRITE=1 only for a trusted workspace, then retry with write=true."
        );
      }

      const report: ForensicReport = {
        title: args.title,
        conclusion: args.conclusion,
        repository: args.repository,
        branch: args.branch,
        build: args.build,
        architecture: args.architecture,
        filesInspected: args.filesInspected,
        toolsUsed: args.toolsUsed,
        evidence: args.evidence,
        findings: args.findings,
        relatedFunctions: args.relatedFunctions,
        addresses: args.addresses,
        hypotheses: args.hypotheses,
        detectedProblems: args.detectedProblems,
        testsPerformed: args.testsPerformed,
        proposedFixes: args.proposedFixes,
        risks: args.risks
      };
      const result = await writeReport(report, {
        format: args.format ?? "both",
        apply: args.write === true,
        workspace: config.workspaceRoots[0]
      });
      return ok({
        investigationId: result.id,
        format: args.format ?? "both",
        written: result.written,
        outputDirectory: result.written ? `${config.workspaceRoots[0] ?? process.cwd()}/.retrace/reports` : undefined,
        markdown: result.markdown,
        json: result.json
      });
    }
  );
}
