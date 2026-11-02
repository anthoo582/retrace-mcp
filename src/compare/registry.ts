import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

export type EquivalenceSide = {
  platform: "n64" | "ps2";
  file?: string;
  address: number;
  name: string;
  sha256?: string;
};

export type EquivalenceRecord = {
  id: string;
  level: "confirmed";
  n64: EquivalenceSide;
  ps2: EquivalenceSide;
  evidence: string[];
  recordedBy: string;
  recordedAt: string;
  notes?: string;
};

export type EquivalenceStore = {
  version: 1;
  workspace: string;
  records: EquivalenceRecord[];
  updatedAt: string;
};

function storePath(workspace: string, dataDir = config.dataDir): string {
  const hash = crypto.createHash("sha1").update(path.resolve(workspace)).digest("hex").slice(0, 12);
  return path.join(dataDir, "equivalences", `${hash}.json`);
}

function recordId(record: { n64: { name: string; address: number }; ps2: { name: string; address: number } }): string {
  const seed = `${record.n64.name}@${record.n64.address.toString(16)}|${record.ps2.name}@${record.ps2.address.toString(16)}`;
  return `eq_${crypto.createHash("sha1").update(seed).digest("hex").slice(0, 12)}`;
}

export class EquivalenceRegistry {
  constructor(readonly filePath: string) {}

  static forWorkspace(workspace: string, dataDir?: string): EquivalenceRegistry {
    return new EquivalenceRegistry(storePath(workspace, dataDir));
  }

  async load(): Promise<EquivalenceStore> {
    try {
      const text = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(text) as EquivalenceStore;
      if (parsed.version !== 1) throw new Error(`Unsupported equivalence store version: ${parsed.version}`);
      return parsed;
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
        return { version: 1, workspace: "", records: [], updatedAt: new Date().toISOString() };
      }
      throw error;
    }
  }

  private async save(store: EquivalenceStore): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    store.updatedAt = new Date().toISOString();
    const temp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(store, null, 2));
    await fs.rename(temp, this.filePath);
  }

  async add(
    workspace: string,
    input: {
      n64: Omit<EquivalenceSide, "platform">;
      ps2: Omit<EquivalenceSide, "platform">;
      evidence: string[];
      recordedBy: string;
      notes?: string;
    }
  ): Promise<EquivalenceRecord> {
    if (input.evidence.filter((entry) => entry.trim().length > 0).length === 0) {
      throw new Error("A confirmed equivalence requires at least one evidence entry.");
    }
    if (!input.n64.name || !input.ps2.name) throw new Error("Both function names are required.");
    if (!Number.isFinite(input.n64.address) || !Number.isFinite(input.ps2.address)) {
      throw new Error("Both addresses are required and must be finite numbers.");
    }
    if (!input.recordedBy.trim()) throw new Error("recordedBy is required so the claim is attributable.");
    const store = await this.load();
    store.workspace = path.resolve(workspace);
    const record: EquivalenceRecord = {
      id: recordId(input),
      level: "confirmed",
      n64: { platform: "n64", ...input.n64 },
      ps2: { platform: "ps2", ...input.ps2 },
      evidence: input.evidence.filter((entry) => entry.trim().length > 0),
      recordedBy: input.recordedBy.trim(),
      recordedAt: new Date().toISOString(),
      notes: input.notes
    };
    const existing = store.records.findIndex((entry) => entry.id === record.id);
    if (existing >= 0) store.records[existing] = record;
    else store.records.push(record);
    await this.save(store);
    return record;
  }

  async list(filter: { n64Name?: string; ps2Name?: string; file?: string } = {}): Promise<EquivalenceRecord[]> {
    const store = await this.load();
    return store.records.filter((record) => {
      if (filter.n64Name && !record.n64.name.toLowerCase().includes(filter.n64Name.toLowerCase())) return false;
      if (filter.ps2Name && !record.ps2.name.toLowerCase().includes(filter.ps2Name.toLowerCase())) return false;
      if (filter.file && ![record.n64.file, record.ps2.file].some((entry) => entry?.includes(filter.file!))) return false;
      return true;
    });
  }
}
