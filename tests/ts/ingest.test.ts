import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { KnowledgeGraph } from "../../src/knowledge/graph.js";
import { ingestRom, ingestSymbolTable } from "../../src/knowledge/ingest.js";

describe("knowledge / ingest", () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpFile = path.join(os.tmpdir(), `retrace_test_ingest_${suffix}.json`);
  const tmpDir = path.join(os.tmpdir(), `retrace_test_ingest_ws_${suffix}`);

  afterEach(async () => {
    await fs.rm(tmpFile, { force: true });
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("ingests a symbol table as functions and file edges", async () => {
    const kg = new KnowledgeGraph(tmpFile);
    const report = await ingestSymbolTable(
      kg,
      tmpDir,
      "symbols.txt",
      "80000400 func_main\n80000500 func_update\n"
    );
    expect(report.table.symbols.length).toBe(2);
    const stats = await kg.stats();
    expect(stats.nodes).toBe(3);
    expect(stats.byType.function).toBe(2);
    expect(stats.edges).toBe(2);
  });

  it("ingests an N64 ROM header and code regions", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const romPath = path.join(tmpDir, "game.z64");
    const rom = Buffer.alloc(0x2000);
    Buffer.from([0x80, 0x37, 0x12, 0x40]).copy(rom, 0);
    rom.write("TEST GAME", 0x20, "ascii");
    rom.writeUInt32BE(0x80000400, 0x08);
    await fs.writeFile(romPath, rom);
    const kg = new KnowledgeGraph(tmpFile);
    const report = await ingestRom(kg, tmpDir, romPath, rom);
    expect(report.source).toBe("game.z64");
    const stats = await kg.stats();
    expect(stats.nodes).toBeGreaterThanOrEqual(1);
    expect(stats.byType.file).toBe(1);
    expect(report.notes.join(" ")).toContain("code regions");
  });
});
