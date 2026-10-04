// Class audio in the live view: mono 16 kHz IMA ADPCM (`LiveAudioChunk` in packages/shared).
// A port of `LiveAudioCodec.decode` (packages/kinetix_ink/lib/src/live_audio.dart), checked
// sample for sample against the Dart codec (fixtures/live-audio.json), and the timing that
// plays chunks back to back. Pure: the Web Audio side is in components/live/useLiveAudio.ts.

export const AUDIO_RATE = 16000;

const STEPS = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279,
  307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428,
  4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const INDEX_SHIFT = [-1, -1, -1, -1, 2, 4, 6, 8];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Decodes one chunk: a 4-byte header (predictor int16 LE, step index, 0), then two 4-bit
 * samples a byte, low nibble first. A malformed chunk decodes to no samples.
 */
export function decodeAdpcm(chunk: Uint8Array): Int16Array {
  if (chunk.length < 4) return new Int16Array(0);
  let predictor = (chunk[0] | (chunk[1] << 8)) << 16 >> 16; // int16 little-endian
  let index = chunk[2];
  if (index > 88) return new Int16Array(0);
  const out = new Int16Array((chunk.length - 4) * 2);
  for (let i = 0; i < out.length; i++) {
    const byte = chunk[4 + (i >> 1)];
    const nibble = (i & 1) === 0 ? byte & 0x0f : byte >> 4;
    const step = STEPS[index];
    let delta = step >> 3;
    if (nibble & 4) delta += step;
    if (nibble & 2) delta += step >> 1;
    if (nibble & 1) delta += step >> 2;
    predictor = clamp(nibble & 8 ? predictor - delta : predictor + delta, -32768, 32767);
    index = clamp(index + INDEX_SHIFT[nibble & 7], 0, 88);
    out[i] = predictor;
  }
  return out;
}

/** Base64 to bytes; invalid base64 gives `null`. */
export function base64Bytes(data: string): Uint8Array | null {
  try {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** `LiveAudioChunk.data` to samples (none for a malformed chunk). */
export function decodeChunk(data: string): Int16Array {
  const bytes = typeof data === 'string' ? base64Bytes(data) : null;
  return bytes ? decodeAdpcm(bytes) : new Int16Array(0);
}

/** 16-bit samples as Web Audio floats (−1…1). */
export function toFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}

export interface ScheduleOptions {
  /** How far ahead of "now" playback starts (and restarts), in seconds: room for network jitter. */
  lead: number;
  /** Queued audio beyond this (seconds ahead of now) means latency has built up: start over. */
  maxAhead: number;
}

export const SCHEDULE: ScheduleOptions = { lead: 0.3, maxAhead: 1.5 };

/**
 * When to start the next chunk. `next` is when the previous chunk ends (0 before the first),
 * `now` the audio clock, `duration` the chunk's length (all seconds). Chunks play back to back;
 * if the queue ran dry (a late or lost chunk) or has drifted more than `maxAhead` ahead, playback
 * restarts `lead` from now (on `reset` the player stops anything still queued, so nothing
 * overlaps). Returns the start time and the new `next`.
 */
export function scheduleChunk(next: number, now: number, duration: number, opts: ScheduleOptions = SCHEDULE): { start: number; next: number; reset: boolean } {
  const reset = next < now || next - now > opts.maxAhead;
  const start = reset ? now + opts.lead : next;
  return { start, next: start + duration, reset };
}
