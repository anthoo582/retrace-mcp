import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { resolveInWorkspace } from "../security/paths.js";
import { execFile } from "../core/exec.js";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".vs",
  ".vscode",
  ".idea",
  "__pycache__",
  ".cache",
  "coverage",
  ".retrace",
  ".git-lfs"
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".c": "C",
  ".h": "C header",
  ".inc": "C include fragment",
  ".inc.c": "C include fragment",
  ".cc": "C++",
  ".cpp": "C++",
  ".hpp": "C++ header",
  ".s": "MIPS assembly",
  ".asm": "Assembly",
  ".py": "Python",
  ".js": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".ld": "Linker script",
  ".mk": "Make",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".json": "JSON",
  ".toml": "TOML",
  ".md": "Markdown",
  ".txt": "Text",
  ".xml": "XML"
};

const BINARY_EXT = new Set([".z64", ".n64", ".v64", ".elf", ".o", ".a", ".bin", ".iso", ".irx", ".pak", ".rom"]);

const BUILD_FILES: Record<string, string> = {
  Makefile: "GNU Make",
  "makefile": "GNU Make",
  "GNUmakefile": "GNU Make",
  "CMakeLists.txt": "CMake",
  "meson.build": "Meson",
  "build.ninja": "Ninja",
  "package.json": "npm",
  "Cargo.toml": "Cargo",
  "pyproject.toml": "Python (pyproject)",
  "setup.py": "Python (setuptools)",
  "requirements.txt": "Python (pip)",
  "go.mod": "Go modules",
  "build.sh": "shell build script"
};

export type RepoFile = {
  path: string;
  relative: string;
  size: number;
  extension: string;
  language: string;
  binary: boolean;
};

export type RepoIndex = {
  root: string;
  generatedAt: string;
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
  languages: Array<{ language: string; files: number; bytes: number }>;
  buildSystems: Array<{ file: string; system: string }>;
  binaries: RepoFile[];
  symbolFiles: string[];
  configFiles: string[];
  directories: Array<{ directory: string; files: number; bytes: number }>;
  git: { available: boolean; branch?: string; remote?: string; head?: string; dirtyFiles?: number; error?: string };
  duplicatedGroups: Array<{ size: number; sha1: string; files: string[] }>;
  largestFiles: RepoFile[];
};

export type IndexOptions = {
  maxFiles?: number;
  maxDepth?: number;
  includeDuplicates?: boolean;
};

async function walk(
  root: string,
  current: string,
  depth: number,
  maxDepth: number,
  maxFiles: number,
  files: RepoFile[]
): Promise<void> {
  if (files.length >= maxFiles) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (files.length >= maxFiles) return;
    if (entry.name.startsWith(".git")) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (depth >= maxDepth) continue;
      await walk(root, path.join(current, entry.name), depth + 1, maxDepth, maxFiles, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const absolute = path.join(current, entry.name);
    let size = 0;
    try {
      size = (await fs.stat(absolute)).size;
    } catch {
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    const language = LANGUAGE_BY_EXT[extension] ?? (BINARY_EXT.has(extension) ? "Binary" : "Other");
    files.push({
      path: absolute,
      relative: path.relative(root, absolute).split(path.sep).join("/"),
      size,
      extension,
      language,
      binary: BINARY_EXT.has(extension)
    });
  }
}

async function gitInfo(root: string): Promise<RepoIndex["git"]> {
  try {
    const [branch, remote, head, status] = await Promise.all([
      execFile("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], { timeoutMs: 15000 }),
      execFile("git", ["-C", root, "remote", "-v"], { timeoutMs: 15000 }),
      execFile("git", ["-C", root, "log", "-1", "--format=%H %s"], { timeoutMs: 15000 }),
      execFile("git", ["-C", root, "status", "--porcelain"], { timeoutMs: 20000 })
    ]);
    if (branch.code !== 0) {
      return { available: false, error: branch.stderr.trim() || "not a git repository" };
    }
    return {
      available: true,
      branch: branch.stdout.trim(),
      remote: remote.stdout.trim().split(/\r?\n/)[0]?.trim(),
      head: head.stdout.trim(),
      dirtyFiles: status.stdout.trim() ? status.stdout.trim().split(/\r?\n/).length : 0
    };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function duplicates(files: RepoFile[], limit = 20): Promise<RepoIndex["duplicatedGroups"]> {
  const bySize = new Map<number, RepoFile[]>();
  for (const file of files) {
    if (file.size < 4096 || file.binary) continue;
    const bucket = bySize.get(file.size) ?? [];
    bucket.push(file);
    bySize.set(file.size, bucket);
  }
  const groups: RepoIndex["duplicatedGroups"] = [];
  for (const [size, bucket] of bySize) {
    if (bucket.length < 2) continue;
    const hashes = new Map<string, string[]>();
    for (const file of bucket) {
      try {
        const data = await fs.readFile(file.path);
        const sha1 = crypto.createHash("sha1").update(data).digest("hex");
        const list = hashes.get(sha1) ?? [];
        list.push(file.relative);
        hashes.set(sha1, list);
      } catch {
        continue;
      }
    }
    for (const [sha1, list] of hashes) {
      if (list.length > 1) groups.push({ size, sha1, files: list });
    }
    if (groups.length >= limit) break;
  }
  return groups.slice(0, limit);
}

export async function buildRepoIndex(rootInput: string, options: IndexOptions = {}): Promise<RepoIndex> {
  const root = resolveInWorkspace(rootInput);
  const maxFiles = Math.min(options.maxFiles ?? 8000, config.maxScanFiles);
  const maxDepth = options.maxDepth ?? 12;
  const files: RepoFile[] = [];
  await walk(root, root, 0, maxDepth, maxFiles, files);

  const languageMap = new Map<string, { files: number; bytes: number }>();
  const directoryMap = new Map<string, { files: number; bytes: number }>();
  const buildSystems: Array<{ file: string; system: string }> = [];
  const symbolFiles: string[] = [];
  const configFiles: string[] = [];
  const binaries: RepoFile[] = [];

  for (const file of files) {
    const language = languageMap.get(file.language) ?? { files: 0, bytes: 0 };
    language.files += 1;
    language.bytes += file.size;
    languageMap.set(file.language, language);

    const directory = path.posix.dirname(file.relative) === "." ? "<root>" : path.posix.dirname(file.relative);
    const dirStats = directoryMap.get(directory) ?? { files: 0, bytes: 0 };
    dirStats.files += 1;
    dirStats.bytes += file.size;
    directoryMap.set(directory, dirStats);

    const base = path.posix.basename(file.relative);
    if (BUILD_FILES[base]) buildSystems.push({ file: file.relative, system: BUILD_FILES[base]! });
    if (/\.(sym|map)$/i.test(base) || /symbols/i.test(base)) symbolFiles.push(file.relative);
    if (/\.(json|ya?ml|toml|ini|cfg|conf)$/i.test(base)) configFiles.push(file.relative);
    if (file.binary) binaries.push(file);
  }

  const index: RepoIndex = {
    root,
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    truncated: files.length >= maxFiles,
    languages: [...languageMap.entries()]
      .map(([language, stats]) => ({ language, ...stats }))
      .sort((a, b) => b.bytes - a.bytes),
    buildSystems,
    binaries,
    symbolFiles,
    configFiles,
    directories: [...directoryMap.entries()]
      .map(([directory, stats]) => ({ directory, ...stats }))
      .sort((a, b) => b.bytes - a.bytes),
    git: await gitInfo(root),
    duplicatedGroups: options.includeDuplicates === false ? [] : await duplicates(files),
    largestFiles: [...files].sort((a, b) => b.size - a.size).slice(0, 10)
  };
  return index;
}

export type SearchHit = {
  file: string;
  line: number;
  text: string;
};

export async function searchCode(
  rootInput: string,
  pattern: string,
  options: { maxResults?: number; caseSensitive?: boolean; extensions?: string[]; maxFileBytes?: number } = {}
): Promise<{ hits: SearchHit[]; scannedFiles: number; truncated: boolean }> {
  const root = resolveInWorkspace(rootInput);
  const maxResults = Math.min(options.maxResults ?? 100, 2000);
  const maxFileBytes = options.maxFileBytes ?? 8 * 1024 * 1024;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, options.caseSensitive ? "g" : "gi");
  } catch (error) {
    throw new Error(`Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`);
  }
  const files: RepoFile[] = [];
  await walk(root, root, 0, 16, config.maxScanFiles, files);
  const hits: SearchHit[] = [];
  let scanned = 0;
  let truncated = false;

  for (const file of files) {
    if (file.binary || file.size > maxFileBytes) continue;
    if (options.extensions && options.extensions.length > 0) {
      if (!options.extensions.includes(file.extension)) continue;
    }
    let content: string;
    try {
      content = await fs.readFile(file.path, "utf8");
    } catch {
      continue;
    }
    if (content.includes("\u0000")) continue;
    scanned += 1;
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      regex.lastIndex = 0;
      if (!regex.test(line)) continue;
      hits.push({ file: file.relative, line: index + 1, text: line.slice(0, 400) });
      if (hits.length >= maxResults) {
        truncated = true;
        return { hits, scannedFiles: scanned, truncated };
      }
    }
  }
  return { hits, scannedFiles: scanned, truncated };
}

export async function findDependencies(rootInput: string): Promise<{
  sources: Array<{ file: string; kind: string; entries: string[] }>;
}> {
  const root = resolveInWorkspace(rootInput);
  const sources: Array<{ file: string; kind: string; entries: string[] }> = [];
  const tryRead = async (relative: string) => {
    try {
      return await fs.readFile(path.join(root, relative), "utf8");
    } catch {
      return null;
    }
  };

  const pkg = await tryRead("package.json");
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg) as Record<string, Record<string, string> | undefined>;
      sources.push({
        file: "package.json",
        kind: "npm",
        entries: Object.keys({ ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) })
      });
    } catch {
      sources.push({ file: "package.json", kind: "npm", entries: ["<unparseable package.json>"] });
    }
  }

  const requirements = await tryRead("requirements.txt");
  if (requirements) {
    sources.push({
      file: "requirements.txt",
      kind: "pip",
      entries: requirements
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    });
  }

  const cmake = await tryRead("CMakeLists.txt");
  if (cmake) {
    const entries = [...cmake.matchAll(/find_package\s*\(\s*([A-Za-z0-9_+-]+)/gi)].map((match) => match[1]!);
    sources.push({ file: "CMakeLists.txt", kind: "cmake", entries: [...new Set(entries)] });
  }

  const makefile = (await tryRead("Makefile")) ?? (await tryRead("makefile"));
  if (makefile) {
    const libs = [...makefile.matchAll(/-l([A-Za-z0-9_+-]+)/g)].map((match) => match[1]!);
    const includes = [...makefile.matchAll(/-I\s*([^\s]+)/g)].map((match) => match[1]!);
    sources.push({ file: "Makefile", kind: "make", entries: [...new Set([...libs.map((lib) => `lib:${lib}`), ...includes.map((inc) => `include:${inc}`)])] });
  }

  const cargo = await tryRead("Cargo.toml");
  if (cargo) {
    const entries = [...cargo.matchAll(/^\s*([A-Za-z0-9_-]+)\s*=/gm)].map((match) => match[1]!);
    sources.push({ file: "Cargo.toml", kind: "cargo", entries: [...new Set(entries)] });
  }

  return { sources };
}

export async function fileHistory(rootInput: string, relativePath: string, limit = 20): Promise<{
  available: boolean;
  commits: Array<{ hash: string; date: string; author: string; subject: string }>;
  error?: string;
}> {
  const root = resolveInWorkspace(rootInput);
  const safeRelative = path.relative(root, resolveInWorkspace(path.join(root, relativePath)));
  const result = await execFile(
    "git",
    ["-C", root, "log", `-n${Math.min(limit, 200)}`, "--format=%H|%ad|%an|%s", "--date=iso", "--", safeRelative],
    { timeoutMs: 30000 }
  );
  if (result.code !== 0) {
    return { available: false, commits: [], error: result.stderr.trim() || "git log failed" };
  }
  const commits = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash = "", date = "", author = "", subject = ""] = line.split("|");
      return { hash, date, author, subject };
    });
  return { available: true, commits };
}
