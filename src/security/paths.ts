import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

export function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function resolveInWorkspace(input: string, mustExist = true): string {
  const candidate = path.resolve(input);
  if (!config.workspaceRoots.some((root) => isInside(root, candidate))) {
    throw new PathSecurityError(
      `Path outside configured workspace roots: ${candidate}. Roots: ${config.workspaceRoots.join(", ")}`
    );
  }
  if (mustExist) {
    return candidate;
  }
  return candidate;
}

export async function statSafe(target: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
  const st = await fs.stat(target);
  return { size: st.size, isFile: st.isFile(), isDirectory: st.isDirectory() };
}

export async function readFileCapped(target: string, offset = 0, length?: number): Promise<Buffer> {
  const st = await fs.stat(target);
  if (!st.isFile()) throw new Error(`Not a regular file: ${target}`);
  if (st.size > config.maxFileBytes) {
    throw new Error(`File exceeds RETRACE_MAX_FILE_BYTES (${st.size} > ${config.maxFileBytes}): ${target}`);
  }
  const end = length === undefined ? st.size : Math.min(st.size, offset + length);
  const size = Math.max(0, end - offset);
  const handle = await fs.open(target, "r");
  try {
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, offset);
    return buffer;
  } finally {
    await handle.close();
  }
}

export async function sha1File(target: string): Promise<string> {
  const handle = await fs.open(target, "r");
  const hash = crypto.createHash("sha1");
  const chunk = Buffer.alloc(1024 * 1024);
  try {
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      if (bytesRead <= 0) break;
      hash.update(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

export function requireWriteAccess(target: string, apply: boolean): void {
  if (!apply) return;
  if (!config.allowWrite) {
    throw new PathSecurityError(
      "Write operations are disabled. Set RETRACE_ALLOW_WRITE=1 to enable guarded writes inside the workspace."
    );
  }
  resolveInWorkspace(target, false);
}

export async function ensureDir(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeFileGuarded(target: string, data: string | Buffer, apply: boolean): Promise<{ written: boolean; path: string }> {
  requireWriteAccess(target, apply);
  if (!apply) return { written: false, path: target };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  return { written: true, path: target };
}
