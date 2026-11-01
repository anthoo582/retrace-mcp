import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import {
  n64MemoryMap,
  ps2MemoryMap,
  lookupRegion,
  inspectPointer,
  detectOverlaps,
  parseRegisterDump,
  resolveCrashContext
} from "../memory/forensics.js";
import { resolveInWorkspace, readFileCapped } from "../security/paths.js";
import { ok } from "../core/evidence.js";

export function registerMemoryTools(server: McpServer): void {
  registerTool(
    server,
    "memory_inspect_region",
    "Inspect a virtual memory address: checks which region it belongs to (RDRAM, KSEG, Main RAM, GS registers, VRAM) on N64 or PS2.",
    {
      address: z.number().describe("Virtual address to check (e.g. 0x80000400 or 0x00100000)"),
      arch: z.enum(["n64", "ps2"]).describe("Console architecture")
    },
    async ({ address, arch }) => {
      const map = arch === "n64" ? n64MemoryMap() : ps2MemoryMap();
      const info = lookupRegion(address, map);
      return ok({ address, arch, regionInfo: info });
    }
  );

  registerTool(
    server,
    "memory_check_alignment",
    "Check a pointer for 4-byte or 8-byte alignment, nullness, and architectural valid range.",
    {
      address: z.number().describe("Pointer value to check"),
      arch: z.enum(["n64", "ps2"]).describe("Console architecture")
    },
    async ({ address, arch }) => {
      const map = arch === "n64" ? n64MemoryMap() : ps2MemoryMap();
      const verdict = inspectPointer(address, map);
      return ok({ address, arch, verdict });
    }
  );

  registerTool(
    server,
    "memory_analyze_overlap",
    "Detect memory layout collisions between buffers, heaps, display lists, and texture staging areas.",
    {
      regions: z.array(
        z.object({
          name: z.string(),
          start: z.number(),
          end: z.number()
        })
      ).describe("List of memory regions to check for collision")
    },
    async ({ regions }) => {
      const overlaps = detectOverlaps(regions);
      return ok({
        checkedCount: regions.length,
        hasOverlaps: overlaps.length > 0,
        overlaps
      });
    }
  );

  registerTool(
    server,
    "crash_analyze",
    "Analyze a crash log or register dump from PCSX2 or an N64 emulator: parses PC, RA, SP, BadVAddr, correlates symbols, and formulates hypotheses.",
    {
      logText: z.string().describe("Log text containing CPU registers or crash dump"),
      arch: z.enum(["n64", "ps2"]).describe("Console architecture")
    },
    async ({ logText, arch }) => {
      const dump = parseRegisterDump(logText);
      const map = arch === "n64" ? n64MemoryMap() : ps2MemoryMap();
      const crash = resolveCrashContext(dump.registers, {
        map,
        badAddress: dump.registers["badvaddr"]
      });
      return ok({
        arch,
        registers: dump.registers,
        crashContext: crash
      });
    }
  );
}
