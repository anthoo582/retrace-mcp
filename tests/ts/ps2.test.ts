import { describe, it, expect } from "vitest";
import {
  decodeGsTexture,
  deswizzleGs,
  gsRequiredBytes,
  gsSwizzleOffset,
  swizzleGs,
  type GsPsm
} from "../../src/graphics/ps2.js";

function fill(length: number, seed = 7): Buffer {
  const buffer = Buffer.alloc(length);
  let state = seed;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    buffer[index] = state & 0xff;
  }
  return buffer;
}

describe("graphics / ps2 GS swizzle", () => {
  it("requires whole 8 KiB pages", () => {
    expect(gsRequiredBytes("PSMCT32", 64, 32)).toBe(8192);
    expect(gsRequiredBytes("PSMT4", 128, 128)).toBe(8192);
    expect(gsRequiredBytes("PSMCT32", 128, 32)).toBe(16384);
  });

  it("maps every texel of a page to a distinct byte address", () => {
    const offsets = new Set<number>();
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 64; x += 1) offsets.add(gsSwizzleOffset("PSMCT32", x, y, 64).offset);
    }
    expect(offsets.size).toBe(64 * 32);
    expect(Math.max(...offsets)).toBeLessThan(8192);
  });

  for (const psm of ["PSMCT32", "PSMCT16", "PSMCT16S", "PSMT8", "PSMT4"] as GsPsm[]) {
    it(`round-trips ${psm} through swizzle and deswizzle`, () => {
      const width = psm === "PSMT4" ? 128 : psm === "PSMT8" ? 128 : 64;
      const height = psm === "PSMT4" ? 128 : psm === "PSMT8" ? 64 : psm === "PSMCT32" ? 32 : 64;
      const bytesPerPixel = psm === "PSMT4" ? 0.5 : psm === "PSMT8" ? 1 : psm === "PSMCT32" ? 4 : 2;
      const linear = fill(Math.ceil(width * height * bytesPerPixel));
      const swizzled = swizzleGs(psm, linear, width, height);
      const { linear: restored } = deswizzleGs(psm, swizzled, width, height);
      expect(restored.equals(linear)).toBe(true);
    });
  }
});

describe("graphics / ps2 GS decode", () => {
  it("decodes linear PSMCT32 texels as R,G,B,A", () => {
    const data = Buffer.from([0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd]);
    const decoded = decodeGsTexture({ psm: "PSMCT32", width: 2, height: 1, data, swizzled: false });
    expect(decoded.pixels[0]).toEqual([0x11, 0x22, 0x33, 0x44]);
    expect(decoded.pixels[1]).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
    expect(decoded.png.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("decodes PSMT8 through a CSM2 CLUT", () => {
    const clut = Buffer.alloc(4 * 4);
    clut.writeUInt32LE(0xff0000ff, 0);
    clut.writeUInt32LE(0xff00ff00, 4);
    const data = Buffer.from([0, 1, 0, 1]);
    const decoded = decodeGsTexture({
      psm: "PSMT8",
      width: 2,
      height: 2,
      data,
      swizzled: false,
      clut: { entries: clut, storage: "CSM2" }
    });
    expect(decoded.pixels[0]).toEqual([0xff, 0, 0, 0xff]);
    expect(decoded.pixels[1]).toEqual([0, 0xff, 0, 0xff]);
  });

  it("refuses CSM1 CLUT ordering instead of guessing", () => {
    expect(() =>
      decodeGsTexture({
        psm: "PSMT8",
        width: 1,
        height: 1,
        data: Buffer.from([0]),
        swizzled: false,
        clut: { entries: Buffer.alloc(4), storage: "CSM1" }
      })
    ).toThrow(/CSM1/);
  });

  it("reports PSMCT24 as unsupported", () => {
    expect(() =>
      decodeGsTexture({ psm: "PSMCT24", width: 1, height: 1, data: Buffer.alloc(4), swizzled: false })
    ).toThrow(/not implemented/);
  });
});
