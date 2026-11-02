import { describe, expect, it } from "vitest";
import { findAdapter, jobPath } from "../../src/port/pipeline.js";

describe("autonomous port pipeline", () => {
  it("selects only an available ISO builder", () => {
    const selected = findAdapter([
      { id: "mkisofs", command: "mkisofs", available: false, purpose: "iso" },
      { id: "genisoimage", command: "genisoimage", available: true, version: "1.1", purpose: "iso" }
    ], ["mkisofs", "genisoimage"]);
    expect(selected?.id).toBe("genisoimage");
  });

  it("stores resumable jobs under the project control directory", () => {
    expect(jobPath("C:\\ports\\mario")).toBe("C:\\ports\\mario\\.retrace\\port-job.json");
  });
});
