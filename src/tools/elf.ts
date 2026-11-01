import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import { resolveInWorkspace } from "../security/paths.js";
import { ElfFile } from "../parsers/elf.js";
import { ok } from "../core/evidence.js";

export function registerElfTools(server: McpServer): void {
  registerTool(
    server,
    "elf_inspect",
    "Inspect a PlayStation 2 or MIPS ELF executable: header, machine type, entry point, section count, segment count.",
    {
      path: z.string().describe("Path to ELF binary in workspace")
    },
    async ({ path: filePath }) => {
      const fullPath = resolveInWorkspace(filePath);
      const elf = await ElfFile.open(fullPath);
      const summary = elf.summary();
      return ok({
        file: filePath,
        summary
      });
    }
  );

  registerTool(
    server,
    "elf_list_sections",
    "List all sections in a PlayStation 2 ELF binary with memory addresses, sizes, and permissions.",
    {
      path: z.string().describe("Path to ELF binary")
    },
    async ({ path: filePath }) => {
      const fullPath = resolveInWorkspace(filePath);
      const elf = await ElfFile.open(fullPath);
      return ok({ file: filePath, sections: elf.sections });
    }
  );

  registerTool(
    server,
    "elf_list_symbols",
    "List symbols from .symtab and .dynsym of a PS2 ELF binary.",
    {
      path: z.string().describe("Path to ELF binary"),
      kind: z.enum(["function", "object", "all"]).optional().describe("Filter by symbol kind")
    },
    async ({ path: filePath, kind }) => {
      const fullPath = resolveInWorkspace(filePath);
      const elf = await ElfFile.open(fullPath);
      let symbols = elf.symbols;
      if (kind && kind !== "all") {
        const targetType = kind === "function" ? "FUNC" : "OBJECT";
        symbols = symbols.filter((s) => s.type === targetType);
      }
      return ok({ file: filePath, total: symbols.length, symbols });
    }
  );

  registerTool(
    server,
    "elf_find_function",
    "Locate a function by virtual address within a PS2 ELF binary.",
    {
      path: z.string().describe("Path to ELF binary"),
      address: z.number().describe("Virtual address in hex or integer (e.g. 0x00100400)")
    },
    async ({ path: filePath, address }) => {
      const fullPath = resolveInWorkspace(filePath);
      const elf = await ElfFile.open(fullPath);
      const match = elf.symbolAt(address);
      const section = elf.sectionAt(address);
      return ok({
        file: filePath,
        address,
        symbol: match,
        section: section ? { name: section.name, addr: section.addr, size: section.size } : undefined
      });
    }
  );
}
