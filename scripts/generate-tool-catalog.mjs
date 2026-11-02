#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const toolsDir = path.join(root, "dist", "tools");
const outputPath = path.join(root, "docs", "TOOLS.md");
const checkOnly = process.argv.includes("--check");

const files = (await fs.readdir(toolsDir))
  .filter((file) => file.endsWith(".js") && file !== "helpers.js")
  .sort();
const groups = [];

for (const file of files) {
  const module = await import(pathToFileURL(path.join(toolsDir, file)).href);
  const register = Object.entries(module).find(([name, value]) =>
    name.startsWith("register") && name.endsWith("Tools") && typeof value === "function"
  );
  if (!register) continue;
  const server = new McpServer({ name: "retrace-catalog", version: "catalog" });
  register[1](server);
  const names = Object.keys(server._registeredTools ?? {}).sort();
  if (names.length > 0) groups.push({ file, names });
}

const allNames = groups.flatMap((group) => group.names);
const body = [
  "# Catálogo de tools (TypeScript)",
  "",
  `Este archivo se genera desde el registro efectivo de src/tools. Total: **${allNames.length} tools**.`,
  "Todas devuelven un sobre `{ ok, data|error, evidence }`.",
  "",
  ...groups.flatMap((group) => [
    `## ${group.file.replace(/\\.js$/, "")}`,
    "",
    `**${group.names.length} tools:** ${group.names.map((name) => "`" + name + "`").join(", ")}.`,
    ""
  ]),
  "## Política de escritura",
  "",
  "Solo las tools con apply=true, confirm=true o una ruta de salida explícita escriben.",
  "El pipeline exige RETRACE_ALLOW_WRITE=1, conserva el árbol fuente y no crea una ISO",
  "si no existe un builder real (mkisofs o genisoimage).",
  ""
].join("\n");

if (checkOnly) {
  const current = await fs.readFile(outputPath, "utf8");
  if (current !== body) {
    console.error("Tool catalog is stale. Run: npm run generate:tools");
    process.exitCode = 1;
  }
} else {
  await fs.writeFile(outputPath, body, "utf8");
  console.log(`Generated ${outputPath} (${allNames.length} tools)`);
}
