import { describe, expect, it } from 'vitest';
import { base64Bytes, decodeAdpcm, decodeChunk, scheduleChunk, SCHEDULE, toFloat32 } from './audio';
import fixture from './fixtures/live-audio.json';

describe('class audio decoder', () => {
  it('decodes exactly what the Dart codec on the boards decodes', () => {
    expect(fixture.rate).toBe(16000);
    expect(fixture.chunks.length).toBe(3);
    for (const c of fixture.chunks) {
      const got = decodeChunk(c.data);
      expect(got.length).toBe(c.samples.length);
      expect(Array.from(got)).toEqual(c.samples);
    }
  });

  it('the fixture is a real tone: loud, varied and clipping where it should', () => {
    const all = fixture.chunks.flatMap((c) => c.samples);
    expect(Math.max(...all)).toBe(32767);
    expect(Math.min(...all)).toBe(-32768);
    expect(new Set(all).size).toBeGreaterThan(1000);
    // 3200 + 800 samples, then 101 samples padded to a whole byte.
    expect(fixture.chunks.map((c) => c.samples.length)).toEqual([3200, 800, 102]);
  });

  it('reads the header: negative predictor, step index, and refuses bad chunks', () => {
    // predictor -2 (0xfffe LE), index 0, then nibbles 0x0 (+0) and 0x8 (-0): step 7 >> 3 = 0.
    expect(Array.from(decodeAdpcm(new Uint8Array([0xfe, 0xff, 0, 0, 0x80])))).toEqual([-2, -2]);
    // nibble 7 at index 0: delta 0 + 7 + 3 + 1 = 11; index +8; nibble 0x7 again at step 16: 2+16+8+4 = 30
    expect(Array.from(decodeAdpcm(new Uint8Array([0, 0, 0, 0, 0x77])))).toEqual([11, 41]);
    expect(decodeAdpcm(new Uint8Array([0, 0, 89, 0, 0x11])).length).toBe(0);
    expect(decodeAdpcm(new Uint8Array([0, 0, 0])).length).toBe(0);
    expect(decodeChunk('not base64!').length).toBe(0);
    expect(base64Bytes('AAEC')).toEqual(new Uint8Array([0, 1, 2]));
  });

  it('converts to floats for Web Audio', () => {
    expect(Array.from(toFloat32(new Int16Array([0, 16384, -32768])))).toEqual([0, 0.5, -1]);
  });
});

describe('class audio scheduling', () => {
  const d = 0.2; // a 200 ms chunk

  it('starts a lead ahead of now, then plays chunks back to back', () => {
    let s = scheduleChunk(0, 10, d);
    expect(s).toEqual({ start: 10 + SCHEDULE.lead, next: 10 + SCHEDULE.lead + d, reset: true });
    const first = s.next;
    s = scheduleChunk(s.next, 10.05, d);
    expect(s.reset).toBe(false);
    expect(s.start).toBe(first);
    expect(s.next).toBeCloseTo(first + d);
  });

  it('starts over when it falls behind (a late or lost chunk)', () => {
    const s = scheduleChunk(10.5, 10.6, d);
    expect(s.reset).toBe(true);
    expect(s.start).toBeCloseTo(10.6 + SCHEDULE.lead);
  });

  it('starts over when too much has queued up (more than 1.5 s ahead)', () => {
    expect(scheduleChunk(11.4, 10, d).reset).toBe(false);
    const s = scheduleChunk(11.6, 10, d);
    expect(s.reset).toBe(true);
    expect(s.start).toBeCloseTo(10.3);
  });

  it('keeps a steady stream steady', () => {
    let next = 0;
    let resets = 0;
    // Chunks arrive every 200 ms with up to 100 ms of jitter.
    for (let i = 0; i < 100; i++) {
      const now = i * d + ((i * 37) % 10) / 100;
      const s = scheduleChunk(next, now, d);
      if (s.reset) resets++;
      next = s.next;
    }
    expect(resets).toBe(1);
  });
});
