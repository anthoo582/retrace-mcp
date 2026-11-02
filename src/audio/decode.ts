import { decodeVagAdpcm, inspectAudio } from "./formats.js";

export type DecodedAudio = {
  format: "VAG" | "N64-VADPCM" | "WAV";
  sampleRate: number;
  channels: number;
  samples: Int16Array;
  durationSeconds: number;
  notes: string[];
  limitations: string[];
};

export type WavResult = {
  buffer: Buffer;
  sampleRate: number;
  channels: number;
  bitsPerSample: 16;
};

export function encodeWavPcm16(samples: Int16Array, sampleRate: number, channels = 1): WavResult {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error(`Invalid sample rate: ${sampleRate}`);
  if (channels <= 0 || !Number.isInteger(channels)) throw new Error(`Invalid channel count: ${channels}`);
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index]!, 44 + index * 2);
  }
  return { buffer, sampleRate, channels, bitsPerSample: 16 };
}

export function decodeVagFile(buffer: Buffer): DecodedAudio {
  const info = inspectAudio(buffer);
  if (info.format !== "VAG" && info.format !== "VAGI") {
    throw new Error(`Not a VAG/VAGi file (detected ${info.format}).`);
  }
  const dataOffset = info.dataOffset ?? 0x30;
  const dataBytes = info.dataBytes ?? Math.max(0, buffer.length - dataOffset);
  const data = buffer.subarray(dataOffset, dataOffset + dataBytes);
  const samples = decodeVagAdpcm(data);
  const sampleRate = info.sampleRate ?? 0;
  if (sampleRate <= 0) throw new Error("VAG header has no usable sample rate; refusing to guess.");
  return {
    format: "VAG",
    sampleRate,
    channels: 1,
    samples,
    durationSeconds: samples.length / sampleRate,
    notes: [`Decoded ${Math.floor(dataBytes / 16)} SPU2 ADPCM frames.`],
    limitations: [
      "SPU2 ADPCM filters are applied as documented; no interpolation or reverb.",
      "Loop points are not applied: output is the raw linear stream."
    ]
  };
}

export type VadpcmCodebook = {
  order: number;
  predictors: number;
  entries: Int16Array;
};

export type AifcVadpcm = {
  codebook: VadpcmCodebook;
  sampleRate: number;
  channels: number;
  sampleFrames: number;
  dataOffset: number;
  dataBytes: number;
};

function readExtended80(buffer: Buffer, offset: number): number {
  const exponent = buffer.readUInt16BE(offset);
  const mantissa = buffer.readUInt32BE(offset + 2);
  if (exponent === 0 && mantissa === 0) return 0;
  return Math.round(mantissa * Math.pow(2, exponent - 16383 - 31));
}

function align2(value: number): number {
  return value + (value % 2);
}

export function parseAifcVadpcm(buffer: Buffer): AifcVadpcm {
  if (buffer.toString("ascii", 0, 4) !== "FORM" || buffer.toString("ascii", 8, 12) !== "AIFC") {
    throw new Error("Not an AIFC container (expected FORM/AIFC).");
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = 0;
  let sampleFrames = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  let codebook: VadpcmCodebook | undefined;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32BE(offset + 4);
    const body = offset + 8;
    if (id === "COMM" && body + 22 <= buffer.length) {
      channels = buffer.readUInt16BE(body);
      sampleFrames = buffer.readUInt32BE(body + 2);
      sampleRate = readExtended80(buffer, body + 8);
    } else if (id === "APPL" && body + 8 <= buffer.length && buffer.toString("ascii", body, body + 4) === "stoc") {
      const nameLength = buffer[body + 4] ?? 0;
      const nameStart = body + 5;
      const name = buffer.toString("ascii", nameStart, Math.min(nameStart + nameLength, buffer.length));
      const fieldsStart = body + 4 + align2(1 + nameLength);
      if (name === "VADPCMCODES" && fieldsStart + 6 <= buffer.length) {
        const version = buffer.readUInt16BE(fieldsStart);
        const order = buffer.readUInt16BE(fieldsStart + 2);
        const predictors = buffer.readUInt16BE(fieldsStart + 4);
        if (version !== 1) throw new Error(`Unsupported VADPCMCODES version ${version}`);
        if (order < 1 || order > 8) throw new Error(`Unsupported VADPCM order ${order}`);
        if (predictors < 1 || predictors > 16) throw new Error(`Unsupported predictor count ${predictors}`);
        const count = order * predictors * 8;
        const entriesStart = fieldsStart + 6;
        if (entriesStart + count * 2 > buffer.length) throw new Error("VADPCMCODES chunk is truncated");
        const entries = new Int16Array(count);
        for (let index = 0; index < count; index += 1) entries[index] = buffer.readInt16BE(entriesStart + index * 2);
        codebook = { order, predictors, entries };
      }
    } else if (id === "SSND" && body + 8 <= buffer.length) {
      const blockOffset = buffer.readUInt32BE(body);
      dataOffset = body + 8 + blockOffset;
      dataBytes = Math.max(0, Math.min(size - 8 - blockOffset, buffer.length - dataOffset));
    }
    offset = body + size + (size % 2);
  }
  if (!codebook) {
    throw new Error(
      "AIFC has no VADPCMCODES application chunk: the N64 predictor codebook is file-defined, not a fixed table. " +
        "Retrace refuses to substitute a guessed codebook."
    );
  }
  if (dataOffset < 0) throw new Error("AIFC has no SSND chunk.");
  if (sampleRate <= 0) throw new Error("AIFC has no usable sample rate.");
  return { codebook, sampleRate, channels, sampleFrames, dataOffset, dataBytes };
}

function decodeVadpcmVector(
  order: number,
  scale: number,
  predictor: Int16Array,
  state: Int16Array,
  residual: Int16Array,
  output: Int16Array,
  outputOffset: number
): void {
  const accumulator = new Int32Array(8);
  for (let tap = 0; tap < order; tap += 1) {
    const previous = state[8 - order + tap]!;
    for (let index = 0; index < 8; index += 1) {
      accumulator[index]! += predictor[tap * 8 + index]! * previous;
    }
  }
  for (let index = 0; index < 8; index += 1) {
    const scaledResidual = residual[index]! << scale;
    const sample = (accumulator[index]! >> 11) + scaledResidual;
    output[outputOffset + index] = Math.max(-32768, Math.min(32767, sample));
    for (let next = 0; next < 7 - index; next += 1) {
      accumulator[index + 1 + next]! += predictor[(order - 1) * 8 + next]! * scaledResidual;
    }
  }
  for (let index = 0; index < 8; index += 1) state[index] = output[outputOffset + index]!;
}

export function decodeN64Vadpcm(data: Buffer, codebook: VadpcmCodebook, frameCount?: number): Int16Array {
  const frames = frameCount ?? Math.floor(data.length / 9);
  if (codebook.order < 1 || codebook.order > 8) {
    throw new Error(`VADPCM order ${codebook.order} is outside the supported range 1-8.`);
  }
  if (codebook.entries.length < codebook.order * codebook.predictors * 8) {
    throw new Error("VADPCM codebook is shorter than order * predictors * 8 entries.");
  }
  const output = new Int16Array(frames * 16);
  const state = new Int16Array(8);
  const residual = new Int16Array(8);
  for (let frame = 0; frame < frames; frame += 1) {
    const base = frame * 9;
    const control = data[base] ?? 0;
    const scale = control >>> 4;
    const predictorIndex = control & 0x0f;
    if (predictorIndex >= codebook.predictors) {
      throw new Error(`Frame ${frame} uses predictor ${predictorIndex} but the codebook has ${codebook.predictors}.`);
    }
    const predictorStart = predictorIndex * codebook.order * 8;
    const predictor = codebook.entries.subarray(predictorStart, predictorStart + codebook.order * 8);
    for (let vector = 0; vector < 2; vector += 1) {
      for (let index = 0; index < 8; index += 1) {
        const byte = data[base + 1 + vector * 4 + (index >> 1)] ?? 0;
        const nibble = (index & 1) === 0 ? byte >>> 4 : byte & 0x0f;
        residual[index] = nibble < 8 ? nibble : nibble - 16;
      }
      decodeVadpcmVector(codebook.order, scale, predictor, state, residual, output, frame * 16 + vector * 8);
    }
  }
  return output;
}

export function decodeN64Aifc(buffer: Buffer): DecodedAudio {
  const parsed = parseAifcVadpcm(buffer);
  const data = buffer.subarray(parsed.dataOffset, parsed.dataOffset + parsed.dataBytes);
  const frames = Math.min(
    Math.floor(data.length / 9),
    parsed.sampleFrames > 0 ? Math.ceil(parsed.sampleFrames / 16) : Number.POSITIVE_INFINITY
  );
  const samples = decodeN64Vadpcm(data, parsed.codebook, frames);
  return {
    format: "N64-VADPCM",
    sampleRate: parsed.sampleRate,
    channels: parsed.channels,
    samples,
    durationSeconds: samples.length / parsed.sampleRate / parsed.channels,
    notes: [
      `Decoded ${frames} VADPCM frames with a ${parsed.codebook.predictors}-predictor order-${parsed.codebook.order} codebook read from the file.`
    ],
    limitations: [
      "The codebook is never invented: it must come from the AIFC VADPCMCODES application chunk.",
      "Loop points are not applied: output is the raw linear stream."
    ]
  };
}

export function audioToWav(decoded: DecodedAudio): WavResult {
  return encodeWavPcm16(decoded.samples, decoded.sampleRate, decoded.channels);
}
