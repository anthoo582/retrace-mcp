import { config } from "../config.js";
import { execFile, firstLine } from "../core/exec.js";

export type AdapterId =
  | "python"
  | "capstone"
  | "readelf"
  | "objdump"
  | "objcopy"
  | "nm"
  | "strings"
  | "radare2"
  | "riscv"
  | "ghidra"
  | "gdb"
  | "pcsx2"
  | "ps2-gcc"
  | "ps2-objdump"
  | "git"
  | "make"
  | "cmake"
  | "ninja"
  | "splat"
  | "n64recomp"
  | "m2c"
  | "asm-differ"
  | "ps2client"
  | "ps2-packer"
  | "mkisofs"
  | "genisoimage"
  | "pine";

export type AdapterStatus = {
  id: AdapterId;
  command: string;
  available: boolean;
  version?: string;
  purpose: string;
};

const CANDIDATES: Array<{ id: AdapterId; command: string; purpose: string; versionArgs: string[] }> = [
  { id: "python", command: config.pythonBin, purpose: "Hosts the Capstone MIPS disassembly bridge", versionArgs: ["--version"] },
  { id: "readelf", command: "readelf", purpose: "GNU ELF inspection cross-check", versionArgs: ["--version"] },
  { id: "objdump", command: "objdump", purpose: "GNU disassembly cross-check", versionArgs: ["--version"] },
  { id: "objcopy", command: "objcopy", purpose: "Binary format conversion (N64 ROM byte order)", versionArgs: ["--version"] },
  { id: "nm", command: "nm", purpose: "Symbol table listing", versionArgs: ["--version"] },
  { id: "strings", command: "strings", purpose: "ASCII string extraction", versionArgs: ["--version"] },
  { id: "radare2", command: "r2", purpose: "Deep binary analysis and cross-references", versionArgs: ["-v"] },
  { id: "ghidra", command: "analyzeHeadless", purpose: "Decompilation via Ghidra headless", versionArgs: ["-help"] },
  { id: "gdb", command: "gdb-multiarch", purpose: "Remote MIPS debugging sessions", versionArgs: ["--version"] },
  { id: "pcsx2", command: "pcsx2-qt", purpose: "PS2 emulator debugging and logs", versionArgs: ["--version"] },
  { id: "ps2-gcc", command: "mips64r5900el-ps2-elf-gcc", purpose: "PS2 EE toolchain compilation", versionArgs: ["--version"] },
  { id: "ps2-objdump", command: "mips64r5900el-ps2-elf-objdump", purpose: "PS2 ELF disassembly and sections", versionArgs: ["--version"] },
  { id: "git", command: "git", purpose: "Repository history and diffs", versionArgs: ["--version"] },
  { id: "make", command: "make", purpose: "Project build driver", versionArgs: ["--version"] },
  { id: "cmake", command: "cmake", purpose: "Project build driver", versionArgs: ["--version"] },
  { id: "ninja", command: "ninja", purpose: "Project build driver", versionArgs: ["--version"] },
  { id: "splat", command: "splat", purpose: "N64 ROM/ELF segmentation and asset metadata", versionArgs: ["--version"] },
  { id: "n64recomp", command: "N64Recomp", purpose: "N64 static recompilation to C/C++", versionArgs: ["--help"] },
  { id: "m2c", command: "m2c", purpose: "MIPS assembly to C reconstruction aid", versionArgs: ["--help"] },
  { id: "asm-differ", command: "asm-differ", purpose: "Function assembly matching and regression diffs", versionArgs: ["--help"] },
  { id: "ps2client", command: "ps2client", purpose: "PS2 development network client", versionArgs: ["--help"] },
  { id: "ps2-packer", command: "ps2-packer", purpose: "Optional PS2 ELF packaging", versionArgs: ["--help"] },
  { id: "mkisofs", command: "mkisofs", purpose: "Build a PS2 ISO filesystem from an authorized project tree", versionArgs: ["--version"] },
  { id: "genisoimage", command: "genisoimage", purpose: "Build a PS2 ISO filesystem from an authorized project tree", versionArgs: ["--version"] },
  { id: "pine", command: "pine", purpose: "PCSX2 IPC validation client", versionArgs: ["--help"] }
];

let cache: AdapterStatus[] | null = null;

async function probeCapstone(): Promise<AdapterStatus> {
  const status: AdapterStatus = {
    id: "capstone",
    command: `${config.pythonBin} -c "import capstone"`,
    available: false,
    purpose: "Primary MIPS III / R5900 instruction decoder"
  };
  try {
    const result = await execFile(config.pythonBin, ["-c", "import capstone;print(capstone.__version__)"], {
      timeoutMs: 15000
    });
    if (result.code === 0) {
      status.available = true;
      status.version = result.stdout.trim();
    }
  } catch {
    status.available = false;
  }
  return status;
}

export async function detectAdapters(force = false): Promise<AdapterStatus[]> {
  if (cache && !force) return cache;
  const statuses: AdapterStatus[] = [];
  for (const candidate of CANDIDATES) {
    const version = await firstLine(candidate.command, candidate.versionArgs);
    statuses.push({
      id: candidate.id,
      command: candidate.command,
      available: version !== null,
      version: version ?? undefined,
      purpose: candidate.purpose
    });
  }
  statuses.push(await probeCapstone());
  cache = statuses;
  return statuses;
}

export async function adapter(id: AdapterId): Promise<AdapterStatus | undefined> {
  const statuses = await detectAdapters();
  return statuses.find((entry) => entry.id === id);
}

export async function requireAdapter(id: AdapterId): Promise<AdapterStatus> {
  const status = await adapter(id);
  if (!status || !status.available) {
    throw new AdapterUnavailableError(id);
  }
  return status;
}

export class AdapterUnavailableError extends Error {
  readonly adapterId: AdapterId;
  constructor(id: AdapterId) {
    super(
      `External tool "${id}" is not available on this machine. Install it or use an alternative tool; Retrace will not simulate its output.`
    );
    this.name = "AdapterUnavailableError";
    this.adapterId = id;
  }
}
