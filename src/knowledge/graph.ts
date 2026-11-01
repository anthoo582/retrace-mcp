import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

export type KnowledgeNodeType =
  | "file"
  | "function"
  | "symbol"
  | "structure"
  | "address"
  | "texture"
  | "audio"
  | "memory_region"
  | "build"
  | "crash"
  | "investigation"
  | "note";

export type KnowledgeNode = {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  props: Record<string, unknown>;
  updatedAt: string;
};

export type KnowledgeEdge = {
  from: string;
  to: string;
  type: string;
  props: Record<string, unknown>;
  updatedAt: string;
};

export type KnowledgeGraphData = {
  version: 1;
  workspace: string;
  nodes: Record<string, KnowledgeNode>;
  edges: KnowledgeEdge[];
  updatedAt: string;
};

function graphPath(workspace: string, dataDir = config.dataDir): string {
  const hash = crypto.createHash("sha1").update(path.resolve(workspace)).digest("hex").slice(0, 12);
  return path.join(dataDir, "knowledge", `${hash}.json`);
}

export class KnowledgeGraph {
  constructor(readonly filePath: string) {}

  static forWorkspace(workspace: string, dataDir?: string): KnowledgeGraph {
    return new KnowledgeGraph(graphPath(workspace, dataDir));
  }

  async load(): Promise<KnowledgeGraphData> {
    try {
      const text = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(text) as KnowledgeGraphData;
      if (parsed.version !== 1) throw new Error(`Unsupported knowledge graph version: ${parsed.version}`);
      return parsed;
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
        return { version: 1, workspace: "", nodes: {}, edges: [], updatedAt: new Date().toISOString() };
      }
      throw error;
    }
  }

  async save(data: KnowledgeGraphData): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    data.updatedAt = new Date().toISOString();
    const temp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data, null, 2));
    await fs.rename(temp, this.filePath);
  }

  async upsertNodes(workspace: string, nodes: Array<Omit<KnowledgeNode, "updatedAt">>): Promise<number> {
    const data = await this.load();
    data.workspace = path.resolve(workspace);
    const now = new Date().toISOString();
    for (const node of nodes) {
      const existing = data.nodes[node.id];
      data.nodes[node.id] = {
        id: node.id,
        type: node.type,
        label: node.label,
        props: { ...(existing?.props ?? {}), ...node.props },
        updatedAt: now
      };
    }
    await this.save(data);
    return nodes.length;
  }

  async upsertEdges(workspace: string, edges: Array<Omit<KnowledgeEdge, "updatedAt">>): Promise<number> {
    const data = await this.load();
    data.workspace = path.resolve(workspace);
    const now = new Date().toISOString();
    const seen = new Set(data.edges.map((edge) => `${edge.from}|${edge.type}|${edge.to}`));
    let added = 0;
    for (const edge of edges) {
      const key = `${edge.from}|${edge.type}|${edge.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      data.edges.push({ ...edge, updatedAt: now });
      added += 1;
    }
    await this.save(data);
    return added;
  }

  async neighbors(id: string, depth = 1): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }> {
    const data = await this.load();
    if (!data.nodes[id]) return { nodes: [], edges: [] };
    const visited = new Set<string>([id]);
    let frontier = [id];
    const collectedEdges: KnowledgeEdge[] = [];
    for (let level = 0; level < Math.max(1, Math.min(depth, 4)); level += 1) {
      const next: string[] = [];
      for (const edge of data.edges) {
        if (!frontier.includes(edge.from) && !frontier.includes(edge.to)) continue;
        collectedEdges.push(edge);
        for (const endpoint of [edge.from, edge.to]) {
          if (!visited.has(endpoint)) {
            visited.add(endpoint);
            next.push(endpoint);
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return {
      nodes: [...visited].map((nodeId) => data.nodes[nodeId]).filter((node): node is KnowledgeNode => Boolean(node)),
      edges: collectedEdges
    };
  }

  async find(labelPattern: string, type?: KnowledgeNodeType): Promise<KnowledgeNode[]> {
    const data = await this.load();
    let regex: RegExp;
    try {
      regex = new RegExp(labelPattern, "i");
    } catch {
      regex = new RegExp(labelPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    return Object.values(data.nodes).filter(
      (node) => (!type || node.type === type) && (regex.test(node.label) || regex.test(node.id))
    );
  }

  async stats(): Promise<{ nodes: number; edges: number; byType: Record<string, number>; edgeTypes: Record<string, number>; updatedAt: string }> {
    const data = await this.load();
    const byType: Record<string, number> = {};
    for (const node of Object.values(data.nodes)) byType[node.type] = (byType[node.type] ?? 0) + 1;
    const edgeTypes: Record<string, number> = {};
    for (const edge of data.edges) edgeTypes[edge.type] = (edgeTypes[edge.type] ?? 0) + 1;
    return { nodes: Object.keys(data.nodes).length, edges: data.edges.length, byType, edgeTypes, updatedAt: data.updatedAt };
  }
}
