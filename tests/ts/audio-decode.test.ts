import { describe, it, expect } from "vitest";
import {
  audioToWav,
  decodeN64Aifc,
  decodeN64Vadpcm,
  decodeVagFile,
  encodeWavPcm16,
  parseAifcVadpcm
} from "../../src/audio/decode.js";

function chunk(id: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, "ascii");
  header.writeUInt32BE(body.length, 4);
  const pad = body.length % 2 === 0 ? Buffer.alloc(0) : Buffer.alloc(1);
  return Buffer.concat([header, body, pad]);
}

function formAifc(chunks: Buffer[]): Buffer {
  const body = Buffer.concat([Buffer.from("AIFC", "ascii"), ...chunks]);
  const header = Buffer.alloc(8);
  header.write("FORM", 0, "ascii");
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function commChunk(channels: number, frames: number, sampleRate: number): Buffer {
  const body = Buffer.alloc(22);
  body.writeUInt16BE(channels, 0);
  body.writeUInt32BE(frames, 2);
  body.writeUInt16BE(16, 6);
  body.writeUInt16BE(0x400d, 8);
  body.writeUInt32BE(0xac440000, 10);
  return chunk("COMM", body);
}

function codebookChunk(order: number, predictors: number, coefficients: number[]): Buffer {
  const name = "VADPCMCODES";
  const header = Buffer.alloc(4 + 1 + name.length);
  header.write("stoc", 0, "ascii");
  header[4] = name.length;
  header.write(name, 5, "ascii");
  const fields = Buffer.alloc(6 + coefficients.length * 2);
  fields.writeUInt16BE(1, 0);
  fields.writeUInt16BE(order, 2);
  fields.writeUInt16BE(predictors, 4);
  coefficients.forEach((value, index) => fields.writeInt16BE(value, 6 + index * 2));
  return chunk("APPL", Buffer.concat([header, fields]));
}

function ssndChunk(data: Buffer): Buffer {
  const body = Buffer.alloc(8 + data.length);
  body.writeUInt32BE(0, 0);
  body.writeUInt32BE(0, 4);
  data.copy(body, 8);
  return chunk("SSND", body);
}

describe("audio / decode", () => {
  it("writes a valid 16-bit PCM WAV header", () => {
    const wav = encodeWavPcm16(new Int16Array([0, 1000, -1000]), 22050);
    expect(wav.buffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.buffer.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.buffer.readUInt16LE(22)).toBe(1);
    expect(wav.buffer.readUInt32LE(24)).toBe(22050);
    expect(wav.buffer.readUInt16LE(34)).toBe(16);
    expect(wav.buffer.readUInt32LE(40)).toBe(6);
    expect(wav.buffer.readInt16LE(44 + 4)).toBe(-1000);
  });

  it("decodes a VAG file to 28 samples per frame", () => {
    const data = Buffer.alloc(32);
    data[0] = 0x00;
    data[16] = 0x00;
    const header = Buffer.alloc(48);
    header.write("VAGp", 0, "ascii");
    header.writeUInt32BE(3, 4);
    header.writeUInt32BE(data.length, 12);
    header.writeUInt32BE(22050, 16);
    const decoded = decodeVagFile(Buffer.concat([header, data]));
    expect(decoded.format).toBe("VAG");
    expect(decoded.sampleRate).toBe(22050);
    expect(decoded.samples.length).toBe(56);
    expect(decoded.durationSeconds).toBeCloseTo(56 / 22050, 6);
  });

  it("refuses AIFC without a VADPCMCODES chunk", () => {
    const file = formAifc([commChunk(1, 1, 22050), ssndChunk(Buffer.alloc(9))]);
    expect(() => parseAifcVadpcm(file)).toThrow(/VADPCMCODES/);
  });

  it("reads the codebook from the file and decodes frames", () => {
    const coefficients = new Array(2 * 8 * 8).fill(0);
    const frames = Buffer.alloc(9);
    frames[0] = 0x00;
    frames[1] = 0x77;
    const file = formAifc([
      commChunk(1, 16, 22050),
      codebookChunk(2, 8, coefficients),
      ssndChunk(frames)
    ]);
    const parsed = parseAifcVadpcm(file);
    expect(parsed.codebook.order).toBe(2);
    expect(parsed.codebook.predictors).toBe(8);
    expect(parsed.sampleRate).toBe(22050);
    const decoded = decodeN64Aifc(file);
    expect(decoded.samples.length).toBe(16);
    expect(decoded.samples[0]).toBe(7);
    expect(decoded.format).toBe("N64-VADPCM");
    expect(decoded.notes.join(" ")).toContain("codebook read from the file");
  });

  it("refuses unsupported predictor orders rather than approximating", () => {
    expect(() =>
      decodeN64Vadpcm(Buffer.alloc(9), { order: 9, predictors: 2, entries: new Int16Array(6) })
    ).toThrow(/order 9/);
  });

  it("converts a decoded stream to WAV", () => {
    const wav = audioToWav({
      format: "VAG",
      sampleRate: 44100,
      channels: 1,
      samples: new Int16Array(10),
      durationSeconds: 10 / 44100,
      notes: [],
      limitations: []
    });
    expect(wav.buffer.readUInt32LE(24)).toBe(44100);
  });
});
