import fs from "node:fs/promises";
import path from "node:path";

export type BuildManifest = { file: string; kind: string; scripts?: string[]; hints?: string[] };

export async function analyzeBuild(root: string) {
  const files: BuildManifest[] = [];
  const systems: string[] = [];
  const manifests: Array<{ name: string; system: string; scripts?: string[]; hints?: string[] }> = [
    { name: "package.json", system: "npm" },
    { name: "pyproject.toml", system: "python", hints: ["pytest", "ruff", "hatchling"] },
    { name: "CMakeLists.txt", system: "cmake" },
    { name: "Makefile", system: "make" }
  ];
  for (const manifest of manifests) {
    const target = path.join(root, manifest.name);
    try {
      const text = await fs.readFile(target, "utf8");
      if (!systems.includes(manifest.system)) systems.push(manifest.system);
      const scripts = manifest.name === "package.json" ? Object.keys(JSON.parse(text).scripts ?? {}) : undefined;
      files.push({ file: manifest.name, kind: manifest.system, ...(scripts ? { scripts } : {}), ...(manifest.hints ? { hints: manifest.hints } : {}) });
    } catch {
      // Optional manifests are intentionally absent from the report.
    }
  }
  return { root: path.resolve(root), systems, files, warnings: ["Analysis is read-only; no build command was executed."] };
}
