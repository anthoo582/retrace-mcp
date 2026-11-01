export type Confidence = "confirmed" | "very_likely" | "possible" | "insufficient";

export type Evidence = {
  claim: string;
  source: string;
  address?: string;
  function?: string;
  tool: string;
  result: string;
  confidence: Confidence;
  alternatives?: string[];
};

export type ToolPayload = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; hint?: string };
  evidence?: Evidence[];
  warnings?: string[];
};

export function ok(data: unknown, evidence?: Evidence[], warnings?: string[]): ToolPayload {
  const payload: ToolPayload = { ok: true, data };
  if (evidence && evidence.length > 0) payload.evidence = evidence;
  if (warnings && warnings.length > 0) payload.warnings = warnings;
  return payload;
}

export function fail(code: string, message: string, hint?: string): ToolPayload {
  const payload: ToolPayload = { ok: false, error: { code, message } };
  if (hint) payload.error!.hint = hint;
  return payload;
}

export function evidence(
  claim: string,
  source: string,
  tool: string,
  result: string,
  confidence: Confidence,
  extra?: Partial<Pick<Evidence, "address" | "function" | "alternatives">>
): Evidence {
  return { claim, source, tool, result, confidence, ...extra };
}

export function hex(value: number, width = 8): string {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

export function toText(payload: ToolPayload): string {
  return JSON.stringify(payload, null, 2);
}
