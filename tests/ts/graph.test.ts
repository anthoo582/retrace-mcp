import { describe, it, expect, afterEach } from "vitest";
import { KnowledgeGraph } from "../../src/knowledge/graph.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("knowledge / graph", () => {
  const tmpFile = path.join(os.tmpdir(), `retrace_test_kg_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

  afterEach(async () => {
    try {
      await fs.unlink(tmpFile);
    } catch {
      // ignore
    }
  });

  it("records nodes and edges and queries neighbors", async () => {
    const kg = new KnowledgeGraph(tmpFile);
    await kg.upsertNodes(".", [
      { id: "func:kart_update", type: "function", label: "kart_update", props: { address: 0x80000400 } },
      { id: "texture:mario_sprite", type: "texture", label: "mario_sprite", props: { format: "rgba16" } }
    ]);
    await kg.upsertEdges(".", [
      { from: "func:kart_update", to: "texture:mario_sprite", type: "renders", props: {} }
    ]);

    const res = await kg.neighbors("func:kart_update");
    expect(res.nodes.length).toBe(2);
    expect(res.edges.length).toBe(1);
    expect(res.edges[0]?.type).toBe("renders");
  });
});
