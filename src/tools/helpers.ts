import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import { AdapterUnavailableError } from "../adapters/registry.js";
import { PathSecurityError } from "../security/paths.js";
import { fail, ok, ToolPayload } from "../core/evidence.js";
import { withToolLog } from "../logger.js";

export type ToolResult = ToolPayload | unknown;

export function errorCode(error: unknown): string {
  if (error instanceof AdapterUnavailableError) return "dependency_missing";
  if (error instanceof PathSecurityError) return "path_denied";
  if (error instanceof Error && /ENOENT/.test(error.message)) return "file_not_found";
  if (error instanceof Error && /Unrecognized N64 ROM magic|Missing ELF magic|too small/.test(error.message)) {
    return "invalid_binary";
  }
  return "tool_error";
}

export function registerTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  handler: (args: { [K in keyof Shape]: Shape[K]["_output"] }) => Promise<ToolResult> | ToolResult
): void {
  server.registerTool(
    name,
    { description, inputSchema },
    async (args) => {
      try {
        const result = await withToolLog(name, async () => handler(args as never));
        const payload = isPayload(result) ? result : ok(result);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
          isError: payload.ok === false
        };
      } catch (error) {
        const payload = fail(
          errorCode(error),
          error instanceof Error ? error.message : String(error),
          error instanceof AdapterUnavailableError
            ? "Install the tool or call retrace_probe to see available adapters."
            : undefined
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
          isError: true
        };
      }
    }
  );
}

function isPayload(value: unknown): value is ToolPayload {
  return Boolean(value) && typeof value === "object" && typeof (value as { ok?: unknown }).ok === "boolean";
}

export function parseAddress(value: string | number | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return value >>> 0;
  const trimmed = value.trim();
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return Number.parseInt(trimmed.slice(2), 16) >>> 0;
  if (/^[0-9a-f]{8}$/i.test(trimmed)) return Number.parseInt(trimmed, 16) >>> 0;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) >>> 0;
  throw new Error(`Invalid address: ${value}. Use hex (0x80000400) or decimal.`);
}

export function parseArch(value: string | undefined): "r4300i" | "r5900" | "r5900-mmi" | "mips32" | "mips64" | "mips3" {
  const allowed = ["r4300i", "r5900", "r5900-mmi", "mips32", "mips64", "mips3"] as const;
  if (!value) return "r5900";
  const normalized = value.toLowerCase() as (typeof allowed)[number];
  if (!allowed.includes(normalized)) {
    throw new Error(`Unsupported architecture '${value}'. Use: ${allowed.join(", ")}. N64 = r4300i, PS2 = r5900.`);
  }
  return normalized;
}
