import { describe, it, expect } from "vitest";
import { inspectAudio, decodeVagAdpcm } from "../../src/audio/formats.js";

describe("audio / formats", () => {
  it("inspects audio header formats", () => {
    const vagHeader = Buffer.alloc(48);
    vagHeader.write("VAGp", 0, "ascii");
    vagHeader.writeUInt32BE(0x00000003, 4);
    vagHeader.writeUInt32BE(0x00000800, 12);
    vagHeader.writeUInt32BE(22050, 16);
    vagHeader.write("kart_engine", 32, "ascii");

    const info = inspectAudio(vagHeader, "engine.vag");
    expect(info.format).toBe("VAG");
    expect(info.sampleRate).toBe(22050);
  });

  it("decodes VAG ADPCM blocks into 16-bit PCM samples", () => {
    const vagBlock = Buffer.alloc(16);
    vagBlock[0] = 0x0c;
    vagBlock[1] = 0x00;
    vagBlock[2] = 0x12;

    const pcm = decodeVagAdpcm(vagBlock);
    expect(pcm.length).toBe(28);
  });
});
