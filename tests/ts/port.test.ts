import { describe, expect, it } from "vitest";
import { buildPortPlan, translateMipsBinary, validateTranslation } from "../../src/port/porting.js";

describe("N64/PS2 porting primitives", () => {
  it("converts endian representation without changing the instruction word", () => {
    const result = translateMipsBinary(Buffer.from("27bdffe0", "hex"), { sourcePlatform: "n64", targetPlatform: "ps2" });
    expect(result.translatedHex).toBe("e0ffbd27");
    expect(result.portable).toBe(true);
    expect(result.words[0]?.sourceWord).toBe("0x27bdffe0");
  });

  it("refuses coprocessor instructions unless review mode is explicit", () => {
    expect(() => translateMipsBinary(Buffer.from("40000000", "hex"), { sourcePlatform: "n64", targetPlatform: "ps2" })).toThrow("Translation refused");
    const review = translateMipsBinary(Buffer.from("40000000", "hex"), { sourcePlatform: "n64", targetPlatform: "ps2", allowUnsupported: true });
    expect(review.portable).toBe(false);
    expect(review.warnings.join(" ")).toContain("unsupported");
  });

  it("round-trips supported words and exposes the non-semantic limitation", () => {
    const result = validateTranslation("27bdffe0", "n64", "ps2");
    expect(result.roundTripExact).toBe(true);
    expect(result.notes[0]).toContain("does not prove");
  });

  it("creates explicit port gates", () => {
    const plan = buildPortPlan("n64", "ps2");
    expect(plan.status).toBe("planned");
    expect(plan.stages.map((stage) => stage.id)).toEqual(["inventory", "isa", "runtime", "assets", "build"]);
    expect(plan.stopConditions.length).toBeGreaterThan(0);
  });
});
