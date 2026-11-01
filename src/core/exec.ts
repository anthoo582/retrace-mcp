import { spawn } from "node:child_process";
import { config } from "../config.js";

export type ExecResult = {
  command: string;
  args: string[];
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type ExecOptions = {
  cwd?: string;
  timeoutMs?: number;
  maxBytes?: number;
  env?: Record<string, string>;
  input?: string | Buffer;
};

export function execFile(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? config.commandTimeoutMs;
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...options.env }
    });

    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= maxBytes) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < maxBytes) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ command, args, code, stdout, stderr, timedOut });
    });

    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    } else {
      child.stdin?.end();
    }
  });
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await execFile(command, ["--version"], { timeoutMs: 8000 });
    return result.code === 0 || result.stdout.length > 0 || result.stderr.length > 0;
  } catch {
    return false;
  }
}

export async function firstLine(command: string, args: string[]): Promise<string | null> {
  try {
    const result = await execFile(command, args, { timeoutMs: 10000 });
    const text = `${result.stdout}\n${result.stderr}`.trim();
    if (!text) return null;
    return text.split(/\r?\n/)[0] ?? null;
  } catch {
    return null;
  }
}
