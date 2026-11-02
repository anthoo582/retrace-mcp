import { config } from "../config.js";
import { execFile } from "../core/exec.js";
import { resolveInWorkspace } from "../security/paths.js";

export const ALLOWED_BUILD_COMMANDS = ["npm", "pnpm", "yarn", "python", "pytest", "make", "cmake"] as const;
export type AllowedBuildCommand = (typeof ALLOWED_BUILD_COMMANDS)[number];

const SAFE_ARGUMENT = /^[a-zA-Z0-9_./:@=+,-]+$/;

export function validateBuildRequest(input: { command: AllowedBuildCommand; args?: string[] }) {
  if (!ALLOWED_BUILD_COMMANDS.includes(input.command)) throw new Error(`Command is not in the build allowlist: ${input.command}`);
  const args = input.args ?? [];
  if (args.length > 64) throw new Error("Too many build arguments.");
  if (args.some((arg) => !SAFE_ARGUMENT.test(arg))) throw new Error("Build argument contains a shell character or is not allowed.");
  return { command: input.command, args };
}

export async function runBuild(input: {
  command: AllowedBuildCommand;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}) {
  if (!config.allowWrite) throw new Error("Build execution requires RETRACE_ALLOW_WRITE=1.");
  const request = validateBuildRequest(input);
  const cwd = resolveInWorkspace(input.cwd ?? config.workspaceRoots[0] ?? process.cwd());
  const result = await execFile(request.command, request.args, { cwd, timeoutMs: input.timeoutMs });
  return { ...result, cwd, allowlisted: true };
}
