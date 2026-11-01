import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { Evidence } from "../core/evidence.js";

export type ForensicReport = {
  investigationId?: string;
  title: string;
  repository?: string;
  branch?: string;
  build?: string;
  architecture?: string;
  filesInspected?: string[];
  toolsUsed?: string[];
  evidence?: Evidence[];
  findings?: string[];
  relatedFunctions?: Array<{ name: string; address?: string }>;
  addresses?: Array<{ label: string; address: string }>;
  hypotheses?: Array<{ claim: string; confidence: string; evidence?: string[] }>;
  detectedProblems?: string[];
  testsPerformed?: string[];
  proposedFixes?: string[];
  risks?: string[];
  conclusion: string;
};

function reportId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

export function renderMarkdown(report: ForensicReport): string {
  const id = report.investigationId ?? reportId();
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Investigation | ${id} |`);
  lines.push(`| Generated | ${new Date().toISOString()} |`);
  lines.push(`| Repository | ${report.repository ?? "n/a"} |`);
  lines.push(`| Branch | ${report.branch ?? "n/a"} |`);
  lines.push(`| Build | ${report.build ?? "n/a"} |`);
  lines.push(`| Architecture | ${report.architecture ?? "n/a"} |`);
  lines.push("");
  const section = (title: string, items: string[] | undefined) => {
    lines.push(`## ${title}`);
    lines.push("");
    if (!items || items.length === 0) {
      lines.push("_None recorded._");
    } else {
      for (const item of items) lines.push(`- ${item}`);
    }
    lines.push("");
  };
  section("Files inspected", report.filesInspected);
  section("Tools used", report.toolsUsed);
  lines.push("## Evidence");
  lines.push("");
  if (!report.evidence || report.evidence.length === 0) {
    lines.push("_None recorded._");
  } else {
    lines.push("| Claim | Source | Address | Tool | Result | Confidence |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const item of report.evidence) {
      lines.push(
        `| ${escapeCell(item.claim)} | ${escapeCell(item.source)} | ${item.address ?? ""} | ${item.tool} | ${escapeCell(item.result)} | ${item.confidence} |`
      );
    }
  }
  lines.push("");
  section("Findings", report.findings);
  lines.push("## Hypotheses");
  lines.push("");
  if (!report.hypotheses || report.hypotheses.length === 0) {
    lines.push("_None recorded._");
  } else {
    for (const hypothesis of report.hypotheses) {
      lines.push(`- **${hypothesis.confidence}** — ${hypothesis.claim}`);
      for (const evidenceLine of hypothesis.evidence ?? []) lines.push(`  - ${evidenceLine}`);
    }
  }
  lines.push("");
  if (report.relatedFunctions && report.relatedFunctions.length > 0) {
    lines.push("## Related functions");
    lines.push("");
    for (const fn of report.relatedFunctions) lines.push(`- \`${fn.name}\`${fn.address ? ` at ${fn.address}` : ""}`);
    lines.push("");
  }
  if (report.addresses && report.addresses.length > 0) {
    lines.push("## Addresses");
    lines.push("");
    for (const entry of report.addresses) lines.push(`- ${entry.label}: \`${entry.address}\``);
    lines.push("");
  }
  section("Detected problems", report.detectedProblems);
  section("Tests performed", report.testsPerformed);
  section("Proposed fixes", report.proposedFixes);
  section("Risks", report.risks);
  lines.push("## Conclusion");
  lines.push("");
  lines.push(report.conclusion);
  lines.push("");
  return lines.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export async function writeReport(
  report: ForensicReport,
  options: { outputDir?: string; format?: "markdown" | "json" | "both"; apply?: boolean; workspace?: string } = {}
): Promise<{ id: string; markdown?: string; json?: string; written: boolean }> {
  const id = report.investigationId ?? reportId();
  const enriched = { ...report, investigationId: id };
  const markdown = renderMarkdown(enriched);
  const json = JSON.stringify(enriched, null, 2);
  const format = options.format ?? "both";
  const dir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.join(options.workspace ?? config.workspaceRoots[0] ?? process.cwd(), ".retrace", "reports");
  const result: { id: string; markdown?: string; json?: string; written: boolean } = { id, written: false };
  if (format !== "json") result.markdown = markdown;
  if (format !== "markdown") result.json = json;
  if (options.apply) {
    await fs.mkdir(dir, { recursive: true });
    if (format !== "json") await fs.writeFile(path.join(dir, `${id}.md`), markdown);
    if (format !== "markdown") await fs.writeFile(path.join(dir, `${id}.json`), json);
    result.written = true;
  }
  return result;
}
