import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import { KnowledgeGraph, KnowledgeNodeType } from "../knowledge/graph.js";
import { config } from "../config.js";
import { ok } from "../core/evidence.js";

function getGraph(): KnowledgeGraph {
  return KnowledgeGraph.forWorkspace(config.workspaceRoots[0] ?? process.cwd(), config.dataDir);
}

export function registerGraphTools(server: McpServer): void {
  registerTool(
    server,
    "graph_node_upsert",
    "Add or update a node in the project Knowledge Graph (file, function, symbol, structure, texture, audio, crash).",
    {
      id: z.string().describe("Unique node identifier, e.g. 'func:kart_update'"),
      type: z.enum([
        "file",
        "function",
        "symbol",
        "structure",
        "address",
        "texture",
        "audio",
        "memory_region",
        "build",
        "crash",
        "investigation",
        "note"
      ]).describe("Node type"),
      label: z.string().describe("Human readable label"),
      props: z.record(z.any()).optional().describe("Key-value properties")
    },
    async ({ id, type, label, props }) => {
      const graph = getGraph();
      const count = await graph.upsertNodes(config.workspaceRoots[0] ?? process.cwd(), [
        { id, type: type as KnowledgeNodeType, label, props: props ?? {} }
      ]);
      return ok({ upserted: count, id });
    }
  );

  registerTool(
    server,
    "graph_edge_upsert",
    "Add or update a relationship edge between two nodes in the Knowledge Graph.",
    {
      from: z.string().describe("Source node ID"),
      to: z.string().describe("Target node ID"),
      relationship: z.string().describe("Relationship name, e.g. 'renders', 'calls', 'allocates', 'crashed_at'"),
      props: z.record(z.any()).optional().describe("Edge metadata")
    },
    async ({ from, to, relationship, props }) => {
      const graph = getGraph();
      const count = await graph.upsertEdges(config.workspaceRoots[0] ?? process.cwd(), [
        { from, to, type: relationship, props: props ?? {} }
      ]);
      return ok({ upserted: count, from, to, relationship });
    }
  );

  registerTool(
    server,
    "graph_query_neighbors",
    "Query related nodes in the Knowledge Graph up to a given depth (e.g. what textures does this function render? What crashes are linked to this address?).",
    {
      nodeId: z.string().describe("Target node ID"),
      depth: z.number().optional().describe("Traversal depth (1 to 4, default 1)")
    },
    async ({ nodeId, depth }) => {
      const graph = getGraph();
      const result = await graph.neighbors(nodeId, depth ?? 1);
      return ok({ nodeId, depth: depth ?? 1, result });
    }
  );
}

