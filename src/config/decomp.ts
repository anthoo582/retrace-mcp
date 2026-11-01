import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { resolveInWorkspace, requireWriteAccess } from "../security/paths.js";

export type SegmentEntry = {
  name?: string;
  type?: string;
  start?: string | number;
  vram?: string | number;
  vrom?: string | number;
  size?: string | number;
  subsections?: unknown[];
  [key: string]: unknown;
};

export type DecompConfigReport = {
  path: string;
  format: "yaml" | "json" | "toml" | "unknown";
  topLevelKeys: string[];
  segments: Array<{ index: number; name?: string; type?: string; start?: string; vram?: string; size?: string; subsegments: number }>;
  counts: { segments: number; subsegments: number; symbols: number; entries: number };
  warnings: string[];
};

function parseStart(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^0x[0-9a-f]+$/i.test(trimmed)) return Number.parseInt(trimmed.slice(2), 16);
    if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  }
  return null;
}

export function sniffConfigFormat(filePath: string): DecompConfigReport["format"] {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".yaml" || extension === ".yml") return "yaml";
  if (extension === ".json") return "json";
  if (extension === ".toml") return "toml";
  return "unknown";
}

export async function inspectDecompConfig(filePath: string): Promise<DecompConfigReport> {
  const absolute = resolveInWorkspace(filePath);
  const text = await fs.readFile(absolute, "utf8");
  const format = sniffConfigFormat(absolute);
  if (format === "toml") {
    return {
      path: absolute,
      format,
      topLevelKeys: [],
      segments: [],
      counts: { segments: 0, subsegments: 0, symbols: 0, entries: 0 },
      warnings: ["TOML configurations are detected but not structurally parsed; use decomp_config_validate_syntax for a raw check."]
    };
  }
  let document: unknown;
  try {
    document = format === "json" ? JSON.parse(text) : YAML.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse ${format.toUpperCase()} configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
  const warnings: string[] = [];
  if (!document || typeof document !== "object") {
    return {
      path: absolute,
      format,
      topLevelKeys: [],
      segments: [],
      counts: { segments: 0, subsegments: 0, symbols: 0, entries: 0 },
      warnings: ["Document is empty or not a mapping."]
    };
  }
  const mapping = document as Record<string, unknown>;
  const topLevelKeys = Object.keys(mapping);
  const segmentsRaw = Array.isArray(mapping.segments) ? mapping.segments : [];
  const segments: DecompConfigReport["segments"] = [];
  let subsegmentCount = 0;
  segmentsRaw.forEach((entry, index) => {
    const segment = (entry ?? {}) as SegmentEntry;
    const subsections = Array.isArray(segment.subsections) ? segment.subsections : Array.isArray(segment.subsegments) ? segment.subsegments : [];
    subsegmentCount += subsections.length;
    const start = parseStart(segment.start);
    const vram = parseStart(segment.vram);
    if (start !== null && vram !== null && start >= 0 && segment.type && segment.type !== "bin" && vram < 0x80000000) {
      warnings.push(
        `Segment ${index} (${String(segment.name)}): vram ${vram} is below 0x80000000 and start ${start} looks like a file offset; verify the segment definition.`
      );
    }
    segments.push({
      index,
      name: typeof segment.name === "string" ? segment.name : undefined,
      type: typeof segment.type === "string" ? segment.type : undefined,
      start: segment.start === undefined ? undefined : String(segment.start),
      vram: segment.vram === undefined ? undefined : String(segment.vram),
      size: segment.size === undefined ? undefined : String(segment.size),
      subsegments: subsections.length
    });
  });
  const symbolsTop = Array.isArray(mapping.symbols) ? mapping.symbols.length : 0;
  const relocTop = Array.isArray(mapping.relocations) ? mapping.relocations.length : 0;
  return {
    path: absolute,
    format,
    topLevelKeys,
    segments,
    counts: { segments: segmentsRaw.length, subsegments: subsegmentCount, symbols: symbolsTop, entries: relocTop },
    warnings
  };
}

export function validateDecompConfig(document: unknown): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!document || typeof document !== "object") {
    return { valid: false, errors: ["Root is not a mapping"], warnings };
  }
  const mapping = document as Record<string, unknown>;
  if (mapping.segments !== undefined && !Array.isArray(mapping.segments)) {
    errors.push("`segments` must be a list");
  }
  const segments = Array.isArray(mapping.segments) ? mapping.segments : [];
  const seenNames = new Set<string>();
  segments.forEach((raw, index) => {
    const segment = (raw ?? {}) as SegmentEntry;
    if (!segment.name) warnings.push(`segments[${index}] has no name`);
    if (segment.name && seenNames.has(segment.name)) errors.push(`Duplicate segment name: ${segment.name}`);
    if (segment.name) seenNames.add(segment.name);
    if (segment.vram !== undefined && parseStart(segment.vram) === null) {
      errors.push(`segments[${index}].vram is not a valid hex/decimal address: ${String(segment.vram)}`);
    }
    if (segment.start !== undefined && parseStart(segment.start) === null) {
      errors.push(`segments[${index}].start is not a valid offset/address: ${String(segment.start)}`);
    }
    if (!segment.type) warnings.push(`segments[${index}] has no type (code, data, bin, ...)`);
  });
  return { valid: errors.length === 0, errors, warnings };
}

export type ConfigProposal = {
  path: string;
  format: DecompConfigReport["format"];
  diff: string;
  before: string;
  after: string;
  validation: { valid: boolean; errors: string[]; warnings: string[] };
  summary: string;
};

function serialize(document: unknown, format: DecompConfigReport["format"]): string {
  if (format === "json") return `${JSON.stringify(document, null, 2)}\n`;
  return YAML.stringify(document, { lineWidth: 0 });
}

export async function proposeConfigChange(
  filePath: string,
  mutate: (document: Record<string, unknown>) => Record<string, unknown>
): Promise<ConfigProposal> {
  const absolute = resolveInWorkspace(filePath);
  const before = await fs.readFile(absolute, "utf8");
  const format = sniffConfigFormat(absolute);
  if (format === "toml" || format === "unknown") {
    throw new Error(`Unsupported configuration format for structured editing: ${format}`);
  }
  const document = format === "json" ? JSON.parse(before) : YAML.parse(before);
  if (!document || typeof document !== "object") throw new Error("Configuration root is not a mapping");
  const updated = mutate(document as Record<string, unknown>);
  const validation = validateDecompConfig(updated);
  const after = serialize(updated, format);
  return {
    path: absolute,
    format,
    before,
    after,
    diff: unifiedDiff(before, after, path.basename(absolute)),
    validation,
    summary: `Proposed ${format.toUpperCase()} edit; ${after.split(/\r?\n/).length - before.split(/\r?\n/).length} line delta.`
  };
}

export async function applyConfigChange(
  proposal: ConfigProposal,
  options: { apply: boolean; backup?: boolean }
): Promise<{ applied: boolean; backupPath?: string; validation: ConfigProposal["validation"] }> {
  if (!options.apply) return { applied: false, validation: proposal.validation };
  if (!proposal.validation.valid) {
    throw new Error(`Refusing to apply invalid configuration: ${proposal.validation.errors.join("; ")}`);
  }
  requireWriteAccess(proposal.path, true);
  let backupPath: string | undefined;
  if (options.backup !== false) {
    backupPath = `${proposal.path}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    await fs.copyFile(proposal.path, backupPath);
  }
  await fs.writeFile(proposal.path, proposal.after);
  return { applied: true, backupPath, validation: proposal.validation };
}

export function unifiedDiff(before: string, after: string, filename = "config", context = 3): string {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  if (before === after) return "";
  if (a.length > 4000 || b.length > 4000) {
    return [`--- a/${filename}`, `+++ b/${filename}`, `@@ -1,${a.length} +1,${b.length} @@`, ...a.map((line) => `-${line}`), ...b.map((line) => `+${line}`)].join("\n");
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  type Op = { kind: " " | "-" | "+"; line: string; aIndex: number; bIndex: number };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: " ", line: a[i]!, aIndex: i, bIndex: j });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: "-", line: a[i]!, aIndex: i, bIndex: j });
      i += 1;
    } else {
      ops.push({ kind: "+", line: b[j]!, aIndex: i, bIndex: j });
      j += 1;
    }
  }
  while (i < a.length) {
    ops.push({ kind: "-", line: a[i]!, aIndex: i, bIndex: j });
    i += 1;
  }
  while (j < b.length) {
    ops.push({ kind: "+", line: b[j]!, aIndex: i, bIndex: j });
    j += 1;
  }
  const changed = ops.map((op, index) => ({ op, index })).filter((entry) => entry.op.kind !== " ");
  if (changed.length === 0) return "";
  const hunks: Array<{ start: number; end: number }> = [];
  for (const { index } of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length, index + context + 1);
    const last = hunks[hunks.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else hunks.push({ start, end });
  }
  const lines: string[] = [`--- a/${filename}`, `+++ b/${filename}`];
  for (const hunk of hunks) {
    const slice = ops.slice(hunk.start, hunk.end);
    const aStart = slice.find((op) => op.kind !== "+")?.aIndex ?? 0;
    const bStart = slice.find((op) => op.kind !== "-")?.bIndex ?? 0;
    const aCount = slice.filter((op) => op.kind !== "+").length;
    const bCount = slice.filter((op) => op.kind !== "-").length;
    lines.push(`@@ -${aStart + 1},${aCount} +${bStart + 1},${bCount} @@`);
    for (const op of slice) lines.push(`${op.kind}${op.line}`);
  }
  return lines.join("\n");
}