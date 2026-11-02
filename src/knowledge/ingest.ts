import path from "node:path";
import crypto from "node:crypto";
import { ElfFile, type ElfSymbol } from "../parsers/elf.js";
import { detectRomFormat, normalizeToBigEndian, parseHeader, extractAsciiStrings, findCodeRegions } from "../parsers/n64rom.js";
import { parseSymbolText, type SymbolTable } from "../parsers/symbols.js";
import type { KnowledgeGraph, KnowledgeEdge, KnowledgeNode } from "./graph.js";

export type IngestReport = {
  source: string;
  nodes: number;
  edges: number;
  notes: string[];
  limitations: string[];
};

function relPath(workspace: string, filePath: string): string {
  return path.relative(path.resolve(workspace), path.resolve(filePath)).replace(/\\/g, "/") || path.basename(filePath);
}

function fileNodeId(relative: string): string {
  return `file:${relative}`;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function symbolNodeId(prefix: "function" | "symbol", symbol: ElfSymbol): string {
  return `${prefix}:${symbol.name || `sub_${symbol.value.toString(16)}`}@${symbol.value.toString(16)}`;
}

export async function ingestElf(
  graph: KnowledgeGraph,
  workspace: string,
  filePath: string,
  buffer: Buffer
): Promise<IngestReport> {
  const elf = ElfFile.fromBuffer(buffer);
  const relative = relPath(workspace, filePath);
  const fileId = fileNodeId(relative);
  const notes: string[] = [];
  const limitations: string[] = [
    "Only symbols, sections and relocations are ingested; no code is decompiled during ingestion.",
    "Dynamic symbols may duplicate static symbols; both are kept and disambiguated by address."
  ];
  const nodes: Array<Omit<KnowledgeNode, "updatedAt">> = [
    {
      id: fileId,
      type: "file",
      label: relative,
      props: {
        kind: "elf",
        sha256: sha256(buffer),
        size: buffer.length,
        elfClass: elf.header.elfClass,
        endian: elf.header.endian,
        machine: elf.header.machineName,
        entry: `0x${elf.header.entry.toString(16)}`
      }
    }
  ];
  const edges: Array<Omit<KnowledgeEdge, "updatedAt">> = [];
  for (const section of elf.sections) {
    if (section.size === 0) continue;
    const sectionId = `section:${relative}:${section.name}`;
    nodes.push({
      id: sectionId,
      type: "structure",
      label: `${relative}:${section.name}`,
      props: {
        kind: "elf_section",
        type: section.typeName,
        flags: section.flagNames,
        address: `0x${section.addr.toString(16)}`,
        size: section.size,
        fileOffset: `0x${section.offset.toString(16)}`
      }
    });
    edges.push({ from: fileId, to: sectionId, type: "contains", props: {} });
  }
  const seen = new Set<string>();
  for (const symbol of [...elf.symbols, ...elf.dynamicSymbols]) {
    if (!symbol.name && symbol.size === 0) continue;
    const isFunction = symbol.type === "FUNC" || (symbol.section !== undefined && elf.sections.find((section) => section.name === symbol.section)?.executable);
    const nodeId = symbolNodeId(isFunction ? "function" : "symbol", symbol);
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: isFunction ? "function" : "symbol",
      label: symbol.name || `sub_${symbol.value.toString(16)}`,
      props: {
        address: `0x${symbol.value.toString(16)}`,
        size: symbol.size,
        binding: symbol.binding,
        symbolType: symbol.type,
        section: symbol.section,
        file: relative,
        source: "elf"
      }
    });
    edges.push({ from: fileId, to: nodeId, type: "defines", props: {} });
    if (symbol.section) {
      edges.push({ from: nodeId, to: `section:${relative}:${symbol.section}`, type: "in_section", props: {} });
    }
  }
  for (const relocation of elf.relocations) {
    if (!relocation.symbol) continue;
    const from = `relocation:${relative}:${relocation.section}@${relocation.offset.toString(16)}`;
    nodes.push({
      id: from,
      type: "address",
      label: `reloc ${relocation.typeName} @0x${relocation.offset.toString(16)}`,
      props: {
        kind: "relocation",
        section: relocation.section,
        type: relocation.typeName,
        offset: `0x${relocation.offset.toString(16)}`,
        symbolIndex: relocation.symbolIndex,
        addend: relocation.addend
      }
    });
    edges.push({ from: fileId, to: from, type: "contains", props: {} });
    edges.push({ from, to: `symbol:${relocation.symbol}`, type: "references", props: { unresolved: true } });
  }
  if (elf.relocations.length > 0) {
    notes.push(`${elf.relocations.length} relocations ingested; targets are name-keyed and may not resolve to a defined symbol node.`);
  }
  const nodeCount = await graph.upsertNodes(workspace, nodes);
  const edgeCount = await graph.upsertEdges(workspace, edges);
  return { source: relative, nodes: nodeCount, edges: edgeCount, notes, limitations };
}

export async function ingestRom(
  graph: KnowledgeGraph,
  workspace: string,
  filePath: string,
  buffer: Buffer
): Promise<IngestReport> {
  const relative = relPath(workspace, filePath);
  const fileId = fileNodeId(relative);
  const format = detectRomFormat(buffer);
  const normalized = normalizeToBigEndian(buffer, format.byteOrder);
  const header = parseHeader(normalized);
  const notes: string[] = [`ROM format ${format.description} (${format.byteOrder}); header parsed after normalisation.`];
  const limitations: string[] = [
    "Only header, code regions and printable strings are ingested; no assets are extracted.",
    "Strings are heuristic ASCII runs and may include data that is not text."
  ];
  const nodes: Array<Omit<KnowledgeNode, "updatedAt">> = [
    {
      id: fileId,
      type: "file",
      label: relative,
      props: {
        kind: "n64_rom",
        sha256: sha256(buffer),
        size: buffer.length,
        byteOrder: format.byteOrder,
        romName: header.romName,
        cartId: header.cartId,
        country: header.countryName,
        entry: `0x${header.entryPoint.toString(16)}`,
        crc1: header.crc1.toString(16),
        crc2: header.crc2.toString(16)
      }
    }
  ];
  const edges: Array<Omit<KnowledgeEdge, "updatedAt">> = [];
  const regions = findCodeRegions(normalized);
  for (const region of regions) {
    const regionId = `memory_region:${relative}:${region.start.toString(16)}`;
    nodes.push({
      id: regionId,
      type: "memory_region",
      label: `code 0x${region.start.toString(16)}-0x${region.end.toString(16)}`,
      props: {
        start: `0x${region.start.toString(16)}`,
        end: `0x${region.end.toString(16)}`,
        size: region.size,
        prologues: region.prologues,
        jalTargets: region.jalTargets
      }
    });
    edges.push({ from: fileId, to: regionId, type: "contains", props: {} });
  }
  const strings = extractAsciiStrings(normalized, 8, 200);
  for (const entry of strings) {
    const stringId = `note:${relative}:string@${entry.offset.toString(16)}`;
    nodes.push({
      id: stringId,
      type: "note",
      label: entry.text.slice(0, 80),
      props: { kind: "rom_string", offset: `0x${entry.offset.toString(16)}`, text: entry.text }
    });
    edges.push({ from: fileId, to: stringId, type: "contains", props: {} });
  }
  notes.push(`${regions.length} code regions and ${strings.length} strings ingested.`);
  const nodeCount = await graph.upsertNodes(workspace, nodes);
  const edgeCount = await graph.upsertEdges(workspace, edges);
  return { source: relative, nodes: nodeCount, edges: edgeCount, notes, limitations };
}

export async function ingestSymbolTable(
  graph: KnowledgeGraph,
  workspace: string,
  source: string,
  text: string
): Promise<IngestReport & { table: SymbolTable }> {
  const table = parseSymbolText(text, source);
  const sourceId = `file:${source}`;
  const nodes: Array<Omit<KnowledgeNode, "updatedAt">> = [
    { id: sourceId, type: "file", label: source, props: { kind: "symbol_table", format: table.format, count: table.symbols.length } }
  ];
  const edges: Array<Omit<KnowledgeEdge, "updatedAt">> = [];
  for (const symbol of table.symbols) {
    const nodeId = `function:${symbol.name}@${symbol.address.toString(16)}`;
    nodes.push({
      id: nodeId,
      type: "function",
      label: symbol.name,
      props: {
        address: `0x${symbol.address.toString(16)}`,
        size: symbol.size,
        kind: symbol.kind,
        source: "symbol_table",
        file: source
      }
    });
    edges.push({ from: sourceId, to: nodeId, type: "defines", props: {} });
  }
  return {
    source,
    nodes: await graph.upsertNodes(workspace, nodes),
    edges: await graph.upsertEdges(workspace, edges),
    notes: [`Parsed ${table.symbols.length} symbols from ${table.format}.`],
    limitations: ["Symbol tables carry no semantics: a name is a claim, not evidence of behaviour."],
    table
  };
}
