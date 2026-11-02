import crypto from "node:crypto";

export type AutopilotStatus = "ready" | "blocked" | "manual" | "passed";

export type AutopilotStage = {
  id: string;
  title: string;
  status: AutopilotStatus;
  dependencies: string[];
  outputs: string[];
  reason?: string;
};

export type AutopilotPlan = {
  schema: "retrace.autopilot.v1";
  sourcePlatform: "n64";
  targetPlatform: "ps2";
  stages: AutopilotStage[];
  blocked: string[];
  humanGates: string[];
  policy: { readOnlyByDefault: true; originalsPreserved: true; noRomBiosIsoAcquisition: true };
};

export function buildAutopilotPlan(capabilities: Record<string, boolean>, hasConfig: boolean): AutopilotPlan {
  const available = (id: string) => capabilities[id] === true;
  const stages: AutopilotStage[] = [
    { id: "intake", title: "ROM intake, hash y metadata", status: "passed", dependencies: [], outputs: ["project.json", "sha256", "rom-header.json"] },
    { id: "splat", title: "Segmentación y manifest", status: available("splat") && hasConfig ? "ready" : "blocked", dependencies: ["splat", "config"], outputs: ["segments", "asset-manifest", "symbols"], reason: !available("splat") ? "splat is not installed" : !hasConfig ? "a splat config is required" : undefined },
    { id: "ghidra", title: "Análisis headless y xrefs", status: available("ghidra") ? "ready" : "blocked", dependencies: ["ghidra"], outputs: ["functions", "xrefs", "pseudocode", "logs"], reason: !available("ghidra") ? "Ghidra Headless is not installed" : undefined },
    { id: "recompile", title: "Recompilación N64 asistida", status: available("n64recomp") && hasConfig ? "ready" : "blocked", dependencies: ["n64recomp", "config"], outputs: ["generated-c", "stubs", "relocations"], reason: !available("n64recomp") ? "N64Recomp is not installed" : !hasConfig ? "an N64Recomp config is required" : undefined },
    { id: "ps2-project", title: "Runtime y proyecto PS2", status: "ready", dependencies: [], outputs: ["EE/IOP scaffold", "memory-map", "backend-checklist"] },
    { id: "ps2-build", title: "Build ELF/IRX", status: available("ps2-gcc") ? "ready" : "blocked", dependencies: ["ps2-gcc", "ps2-objdump"], outputs: ["ELF", "IRX", "map", "build-log"], reason: !available("ps2-gcc") ? "PS2 EE compiler is not installed" : undefined },
    { id: "pcsx2", title: "Smoke test y capturas PS2", status: available("pcsx2") ? "ready" : "blocked", dependencies: ["pcsx2", "authorized BIOS"], outputs: ["stdout", "stderr", "screenshots", "trace"], reason: !available("pcsx2") ? "PCSX2 is not installed" : "an authorized BIOS/configuration is required" },
    { id: "release", title: "Comparación y release gate", status: "manual", dependencies: ["N64 oracle", "PS2 run", "goldens"], outputs: ["regression-report", "SBOM", "human-approval"], reason: "behavioral equivalence and distribution require human review" }
  ];
  return {
    schema: "retrace.autopilot.v1",
    sourcePlatform: "n64",
    targetPlatform: "ps2",
    stages,
    blocked: stages.filter((stage) => stage.status === "blocked").map((stage) => `${stage.id}: ${stage.reason}`),
    humanGates: ["authorized ROM/assets", "unknown RSP/RDP or MMIO", "runtime backend semantics", "PS2 BIOS/hardware", "legal distribution review"],
    policy: { readOnlyByDefault: true, originalsPreserved: true, noRomBiosIsoAcquisition: true }
  };
}

export function hashState(state: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex");
}
