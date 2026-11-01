import path from "node:path";
import os from "node:os";

export type RetraceConfig = {
  workspaceRoots: string[];
  dataDir: string;
  allowWrite: boolean;
  maxFileBytes: number;
  maxScanFiles: number;
  commandTimeoutMs: number;
  pythonBin: string;
  http?: { host: string; port: number; path: string };
};

function splitRoots(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => path.resolve(entry));
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(): RetraceConfig {
  const roots = splitRoots(process.env.RETRACE_WORKSPACE ?? process.env.RETRACE_ROOTS);
  const dataDir = path.resolve(process.env.RETRACE_DATA_DIR ?? path.join(os.homedir(), ".retrace"));
  const cfg: RetraceConfig = {
    workspaceRoots: roots.length > 0 ? roots : [process.cwd()],
    dataDir,
    allowWrite: process.env.RETRACE_ALLOW_WRITE === "1" || process.env.RETRACE_ALLOW_WRITE === "true",
    maxFileBytes: intEnv("RETRACE_MAX_FILE_BYTES", 512 * 1024 * 1024),
    maxScanFiles: intEnv("RETRACE_MAX_SCAN_FILES", 20000),
    commandTimeoutMs: intEnv("RETRACE_COMMAND_TIMEOUT_MS", 60000),
    pythonBin: process.env.RETRACE_PYTHON ?? "python"
  };
  const port = process.env.RETRACE_HTTP_PORT ? Number.parseInt(process.env.RETRACE_HTTP_PORT, 10) : undefined;
  if (port && Number.isFinite(port)) {
    cfg.http = {
      host: process.env.RETRACE_HTTP_HOST ?? "127.0.0.1",
      port,
      path: process.env.RETRACE_HTTP_PATH ?? "/mcp"
    };
  }
  return cfg;
}

export const config = loadConfig();
