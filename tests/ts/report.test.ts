import { describe, expect, it } from "vitest";
import { renderMarkdown, writeReport } from "../../src/reports/report.js";

describe("forensic reports", () => {
  it("renders evidence and uncertainty without inventing missing sections", () => {
    const markdown = renderMarkdown({
      title: "Texture crash",
      conclusion: "Insufficient evidence to identify the owning function.",
      evidence: [{
        claim: "PC is inside executable memory",
        source: "crash.log",
        address: "0x00100000",
        tool: "crash_analyze",
        result: "Address falls in the documented EE code range.",
        confidence: "confirmed"
      }]
    });
    expect(markdown).toContain("# Texture crash");
    expect(markdown).toContain("| confirmed |");
    expect(markdown).toContain("Insufficient evidence");
    expect(markdown).toContain("_None recorded._");
  });

  it("is read-only unless apply is explicitly requested", async () => {
    const result = await writeReport({ title: "Read-only", conclusion: "No changes applied." }, { format: "json" });
    expect(result.written).toBe(false);
    expect(result.json).toContain("Read-only");
    expect(result.markdown).toBeUndefined();
  });
});
