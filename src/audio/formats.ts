export type AudioFormat = "VAG" | "VAGI" | "SS2" | "N64-ADPCM" | "WAV" | "AIFF" | "AIFC" | "N64-SEQ" | "N64-CTL" | "N64-TBL" | "UNKNOWN";

export type AudioInfo = {
  format: AudioFormat;
  confidence: "confirmed" | "very_likely" | "possible" | "insufficient";
  size: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  name?: string;
  dataOffset?: number;
  dataBytes?: number;
  durationSeconds?: number;
  loop?: { start: number; end: number };
  notes: string[];
};

const N64_ADPCM_TABLE = [
  0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 2048, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 2048, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 2048, 1024, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 4096, 2048, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
];

export function inspectAudio(buffer: Buffer): AudioInfo {
  const notes: string[] = [];
  if (buffer.length < 4) {
    return { format: "UNKNOWN", confidence: "insufficient", size: buffer.length, notes: ["File smaller than 4 bytes."] };
  }
  const magic = buffer.toString("ascii", 0, 4);
  if (magic === "VAGp" || magic === "VAGi") {
    const isI = magic === "VAGi";
    const version = buffer.readUInt32BE(4);
    const dataSize = buffer.readUInt32BE(12);
    const sampleRate = buffer.readUInt32BE(16);
    const name = buffer.toString("ascii", 0x20, Math.min(0x30, buffer.length)).replace(/\0.*$/, "").trim();
    const dataOffset = 0x30;
    const frames = Math.floor(Math.min(dataSize, buffer.length - dataOffset) / 16);
    return {
      format: isI ? "VAGI" : "VAG",
      confidence: "confirmed",
      size: buffer.length,
      sampleRate,
      channels: 1,
      bitsPerSample: 4,
      name,
      dataOffset,
      dataBytes: Math.min(dataSize, buffer.length - dataOffset),
      durationSeconds: sampleRate > 0 ? (frames * 28) / sampleRate : undefined,
      notes: [
        `Sony/PS2 VAG${isI ? "i" : ""} header version ${version}, ${frames} ADPCM frames (28 samples each).`,
        "SPU2 ADPCM: 16-byte frames, 1 shift/filter byte + 28 4-bit samples."
      ]
    };
  }

  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") {
    let offset = 12;
    let sampleRate: number | undefined;
    let channels: number | undefined;
    let bits: number | undefined;
    let dataBytes: number | undefined;
    while (offset + 8 <= buffer.length) {
      const id = buffer.toString("ascii", offset, offset + 4);
      const size = buffer.readUInt32LE(offset + 4);
      if (id === "fmt " && offset + 8 + 16 <= buffer.length) {
        channels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        bits = buffer.readUInt16LE(offset + 22);
      }
      if (id === "data") {
        dataBytes = Math.min(size, buffer.length - offset - 8);
        break;
      }
      offset += 8 + size + (size % 2);
    }
    return {
      format: "WAV",
      confidence: "confirmed",
      size: buffer.length,
      sampleRate,
      channels,
      bitsPerSample: bits,
      dataBytes,
      durationSeconds: sampleRate && channels && bits ? (dataBytes ?? 0) / (sampleRate * channels * (bits / 8)) : undefined,
      notes: ["RIFF/WAVE container parsed from chunk headers."]
    };
  }

  if (magic === "FORM" && ["AIFF", "AIFC"].includes(buffer.toString("ascii", 8, 12))) {
    const form = buffer.toString("ascii", 8, 12) as "AIFF" | "AIFC";
    let offset = 12;
    let channels: number | undefined;
    let bits: number | undefined;
    let sampleRate: number | undefined;
    while (offset + 8 <= buffer.length) {
      const id = buffer.toString("ascii", offset, offset + 4);
      const size = buffer.readUInt32BE(offset + 4);
      if (id === "COMM" && offset + 8 + 18 <= buffer.length) {
        channels = buffer.readUInt16BE(offset + 8);
        bits = buffer.readUInt16BE(offset + 14);
        const exponent = buffer.readUInt16BE(offset + 16);
        const mantissa = buffer.readUInt32BE(offset + 18);
        sampleRate = Math.round(mantissa * Math.pow(2, exponent - 16383 - 31));
      }
      offset += 8 + size + (size % 2);
    }
    return {
      format: form,
      confidence: "confirmed",
      size: buffer.length,
      sampleRate,
      channels,
      bitsPerSample: bits,
      notes: ["IFF container; N64 sound tools commonly emit AIFC with VADPCM compression."]
    };
  }

  if (buffer.length > 0x40) {
    const name = buffer.toString("ascii", 0, 20).replace(/[^\x20-\x7e]/g, "").trim();
    const seqLike = /\.seq$/i.test(name) || /^SEQ/i.test(name);
    if (seqLike) {
      return {
        format: "N64-SEQ",
        confidence: "possible",
        size: buffer.length,
        notes: ["Filename heuristic only: no validated N64 sequence parser is implemented."]
      };
    }
  }

  return {
    format: "UNKNOWN",
    confidence: "insufficient",
    size: buffer.length,
    notes: ["No recognized container magic (VAGp, RIFF/WAVE, FORM AIFF)."]
  };
}

const PS2_FILTERS = [
  [0, 0],
  [60, 0],
  [115, -52],
  [98, -55],
  [122, -60]
];

export function decodeVagAdpcm(data: Buffer): Int16Array {
  const frameCount = Math.floor(data.length / 16);
  const samples = new Int16Array(frameCount * 28);
  let previous1 = 0;
  let previous2 = 0;
  let out = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const base = frame * 16;
    const header = data[base]!;
    const shift = header & 0x0f;
    const filterIndex = (header >> 4) & 0x0f;
    const filter = PS2_FILTERS[filterIndex] ?? [0, 0];
    for (let index = 0; index < 28; index += 1) {
      const byte = data[base + 1 + Math.floor(index / 2)]!;
      const nibble = index % 2 === 0 ? byte & 0x0f : byte >>> 4;
      const signed = nibble < 8 ? nibble : nibble - 16;
      let sample = (signed << 12) >> shift;
      sample += ((previous1 * filter[0]!) + (previous2 * filter[1]!)) >> 6;
      sample = Math.max(-32768, Math.min(32767, sample));
      previous2 = previous1;
      previous1 = sample;
      samples[out] = sample;
      out += 1;
    }
  }
  return samples;
}

export function decodeN64AdpcmFrame(frame: Buffer, state: { hist1: number; hist2: number }): Int16Array {
  if (frame.length < 9) throw new Error("N64 VADPCM frame needs 9 bytes (1 header + 8 data)");
  const header = frame[0]!;
  const scale = header & 0x0f;
  const predictor = (header >> 4) & 0x0f;
  const output = new Int16Array(16);
  const base = N64_ADPCM_TABLE[predictor * 16];
  if (base === undefined) throw new Error(`Invalid VADPCM predictor ${predictor}`);
  let hist1 = state.hist1;
  let hist2 = state.hist2;
  for (let index = 0; index < 16; index += 1) {
    const byte = frame[1 + Math.floor(index / 2)] ?? 0;
    const nibble = index % 2 === 0 ? byte >>> 4 : byte & 0x0f;
    const signed = nibble < 8 ? nibble : nibble - 16;
    const sample = ((signed << scale) * 2048 + base * hist1 + (base >> 1) * hist2) >> 11;
    hist2 = hist1;
    hist1 = sample;
    output[index] = Math.max(-32768, Math.min(32767, sample));
  }
  state.hist1 = hist1;
  state.hist2 = hist2;
  return output;
}

export function compareAudio(a: AudioInfo, b: AudioInfo): {
  sameFormat: boolean;
  sameSampleRate: boolean;
  durationDeltaSeconds?: number;
  notes: string[];
} {
  const notes: string[] = [];
  if (a.sampleRate && b.sampleRate && a.sampleRate !== b.sampleRate) {
    notes.push(`Sample rate differs: ${a.sampleRate} Hz vs ${b.sampleRate} Hz (pitch will change by ${(b.sampleRate / a.sampleRate).toFixed(4)}x).`);
  }
  if (a.format !== b.format) notes.push(`Container differs: ${a.format} vs ${b.format}.`);
  const durationDelta =
    a.durationSeconds !== undefined && b.durationSeconds !== undefined ? b.durationSeconds - a.durationSeconds : undefined;
  if (durationDelta !== undefined && Math.abs(durationDelta) > 0.02) {
    notes.push(`Duration differs by ${durationDelta.toFixed(3)} s; check for truncated ADPCM frames or loop handling.`);
  }
  return {
    sameFormat: a.format === b.format,
    sameSampleRate: a.sampleRate === b.sampleRate,
    durationDeltaSeconds: durationDelta,
    notes
  };
}
