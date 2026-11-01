export type ParsedSymbol = {
  name: string;
  address: number;
  size: number;
  kind: "function" | "object" | "unknown";
  source: string;
  line: number;
};

export type SymbolTable = {
  symbols: ParsedSymbol[];
  format: string;
  warnings: string[];
};

function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[0-9a-f]{8,16}$/i.test(text) && /[a-f]/i.test(text)) return Number.parseInt(text, 16);
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  return null;
}

function classify(name: string, explicit: string | undefined, size: number): ParsedSymbol["kind"] {
  if (explicit) {
    const flag = explicit.toUpperCase();
    if (flag === "F" || flag === "T" || flag === "W" || flag === "FUNC") return "function";
    if (flag === "O" || flag === "D" || flag === "B" || flag === "R" || flag === "OBJECT") return "object";
  }
  if (size > 0 && /^[A-Za-z_][\w]*$/.test(name) && /^(func|fn|sub|os|gu|gfx|audio|main|init|update|draw)_/i.test(name)) {
    return "function";
  }
  return "unknown";
}

export function parseSymbolText(text: string, source: string): SymbolTable {
  const warnings: string[] = [];
  const symbols: ParsedSymbol[] = [];
  const lines = text.split(/\r?\n/);
  let format = "unknown";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";") || trimmed.startsWith("//")) continue;

    const assignment = /^([A-Za-z_.$][\w.$]*)\s*=\s*(0x[0-9a-f]+|\d+)\s*;?\s*$/.exec(trimmed);
    if (assignment) {
      const address = parseNumber(assignment[2]!);
      if (address !== null) {
        symbols.push({
          name: assignment[1]!,
          address,
          size: 0,
          kind: classify(assignment[1]!, undefined, 0),
          source,
          line: index + 1
        });
        format = "assignment";
      }
      continue;
    }

    const nmLike = /^(?:([0-9a-f]{8,16})\s+)?([0-9a-f]{8,16})\s+([A-Za-z?])\s+([A-Za-z_.$][\w.$@]*)$/i.exec(trimmed);
    if (nmLike) {
      const address = parseNumber(nmLike[2]!);
      if (address !== null) {
        symbols.push({
          name: nmLike[4]!,
          address,
          size: 0,
          kind: classify(nmLike[4]!, nmLike[3], 0),
          source,
          line: index + 1
        });
        format = "nm";
      }
      continue;
    }

    const splatLike = /^(?:([0-9a-f]{8,16})\s+)?([0-9a-f]{8,16})\s+([0-9a-f]{1,8})\s+([A-Za-z_.$][\w.$@]*)$/i.exec(trimmed);
    if (splatLike) {
      const address = parseNumber(splatLike[2]!);
      const size = parseNumber(splatLike[3]!) ?? 0;
      if (address !== null) {
        symbols.push({
          name: splatLike[4]!,
          address,
          size,
          kind: classify(splatLike[4]!, undefined, size),
          source,
          line: index + 1
        });
        format = "address-size-name";
      }
      continue;
    }

    const mapLine = /^\s*[0-9a-f]{8}\s+([A-Za-z_.$][\w.$@/]*)\s*$/.exec(line);
    if (mapLine) {
      const address = Number.parseInt(trimmed.slice(0, 8), 16);
      symbols.push({
        name: mapLine[1]!,
        address,
        size: 0,
        kind: classify(mapLine[1]!, undefined, 0),
        source,
        line: index + 1
      });
      format = "map";
    }
  }

  if (symbols.length === 0) warnings.push("No symbols recognized. Supported: nm output, assignment form, <addr> <size> <name>, link map.");
  return { symbols: dedupe(symbols), format, warnings };
}

function dedupe(symbols: ParsedSymbol[]): ParsedSymbol[] {
  const seen = new Map<string, ParsedSymbol>();
  for (const symbol of symbols) {
    const key = `${symbol.name}@${symbol.address.toString(16)}`;
    const existing = seen.get(key);
    if (!existing || (existing.size === 0 && symbol.size > 0)) seen.set(key, symbol);
  }
  return [...seen.values()].sort((a, b) => a.address - b.address);
}

export function symbolAt(table: SymbolTable, address: number): ParsedSymbol | undefined {
  let best: ParsedSymbol | undefined;
  for (const symbol of table.symbols) {
    if (address < symbol.address) continue;
    if (symbol.size > 0 && address >= symbol.address + symbol.size) continue;
    if (symbol.size === 0 && address !== symbol.address) continue;
    if (!best || symbol.address > best.address) best = symbol;
  }
  return best;
}

export function compareSymbolTables(a: SymbolTable, b: SymbolTable): {
  onlyInA: ParsedSymbol[];
  onlyInB: ParsedSymbol[];
  moved: Array<{ name: string; from: number; to: number }>;
  resized: Array<{ name: string; from: number; to: number }>;
} {
  const indexA = new Map(a.symbols.map((symbol) => [symbol.name, symbol]));
  const indexB = new Map(b.symbols.map((symbol) => [symbol.name, symbol]));
  const onlyInA: ParsedSymbol[] = [];
  const onlyInB: ParsedSymbol[] = [];
  const moved: Array<{ name: string; from: number; to: number }> = [];
  const resized: Array<{ name: string; from: number; to: number }> = [];
  for (const [name, symbol] of indexA) {
    const other = indexB.get(name);
    if (!other) {
      onlyInA.push(symbol);
      continue;
    }
    if (other.address !== symbol.address) moved.push({ name, from: symbol.address, to: other.address });
    if (other.size !== symbol.size) resized.push({ name, from: symbol.size, to: other.size });
  }
  for (const [name, symbol] of indexB) {
    if (!indexA.has(name)) onlyInB.push(symbol);
  }
  return { onlyInA, onlyInB, moved, resized };
}

export function coverageReport(functions: Array<{ address: number; size: number }>, table: SymbolTable): {
  total: number;
  named: number;
  unnamed: number;
  coverage: number;
  missing: Array<{ address: number; size: number }>;
} {
  let named = 0;
  const missing: Array<{ address: number; size: number }> = [];
  for (const fn of functions) {
    if (symbolAt(table, fn.address)) named += 1;
    else missing.push(fn);
  }
  return {
    total: functions.length,
    named,
    unnamed: functions.length - named,
    coverage: functions.length === 0 ? 0 : named / functions.length,
    missing
  };
}
