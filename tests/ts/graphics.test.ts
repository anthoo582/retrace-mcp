import { describe, it, expect } from "vitest";
import {
  decodeRgba16,
  decodeRgba32,
  analyzePalette,
  ps2LinearToRgba
} from "../../src/graphics/texture.js";

describe("graphics / texture", () => {
  it("decodes N64 RGBA16 texels correctly", () => {
    // 0xF801 in binary: 11111 00000 00000 1 (Red=31, Green=0, Blue=0, Alpha=1)
    const [r, g, b, a] = decodeRgba16(0xf801);
    expect(r).toBe(255); // Red
    expect(g).toBe(0);   // Green
    expect(b).toBe(0);   // Blue
    expect(a).toBe(255); // Alpha
  });

  it("decodes N64 RGBA32 texels correctly", () => {
    const [r, g, b, a] = decodeRgba32(0x123456ff);
    expect(r).toBe(0x12);
    expect(g).toBe(0x34);
    expect(b).toBe(0x56);
    expect(a).toBe(0xff);
  });

  it("analyzes palette colors and detects unique / transparent colors", () => {
    const paletteRaw = Buffer.from([
      0x00, 0x00, // transparent (alpha = 0)
      0xf8, 0x01  // opaque red (alpha = 1)
    ]);
    const report = analyzePalette(paletteRaw, "big");
    expect(report.entries).toBe(2);
    expect(report.transparent).toBe(1);
    expect(report.opaque).toBe(1);
    expect(report.uniqueColours).toBe(2);
  });

  it("maps PS2 linear pixels to RGBA buffer", () => {
    const ps2Data = Buffer.from([0xaa, 0xbb, 0xcc, 0x80]);
    const converted = ps2LinearToRgba("PSMCT32", ps2Data, 1, 1);
    expect(converted.pixels.length).toBe(1);
    expect(converted.pixels[0]![0]).toBe(0xaa);
    expect(converted.pixels[0]![1]).toBe(0xbb);
    expect(converted.pixels[0]![2]).toBe(0xcc);
  });
});
