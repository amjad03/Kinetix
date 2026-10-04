// Plays class audio chunks through Web Audio, back to back (timing: scheduleChunk in
// lib/live/audio.ts). Created from a click, because browsers start audio only after a gesture.

import { AUDIO_RATE, decodeChunk, scheduleChunk, toFloat32 } from '@/lib/live/audio';

export class LiveAudioPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private next = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private volume = 1;
  private muted = false;
  /** Chunks scheduled, and how often playback started over (for the page's data attributes). */
  played = 0;
  resets = 0;

  get running(): boolean {
    return this.ctx !== null;
  }

  /** Call from a click. Asks for a 16 kHz context; a browser that refuses gets its own rate (buffers stay 16 kHz and are resampled). */
  async start(): Promise<void> {
    if (this.ctx) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: AUDIO_RATE, latencyHint: 'interactive' });
    } catch {
      ctx = new AudioContext();
    }
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    this.ctx = ctx;
    this.gain = gain;
    this.applyGain();
    this.next = 0;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  }

  push(data: string): void {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    const pcm = decodeChunk(data);
    if (pcm.length === 0) return;
    const buffer = ctx.createBuffer(1, pcm.length, AUDIO_RATE);
    buffer.copyToChannel(toFloat32(pcm) as Float32Array<ArrayBuffer>, 0);
    const s = scheduleChunk(this.next, ctx.currentTime, buffer.duration);
    if (s.reset) {
      if (this.next !== 0) this.resets++;
      // Drop whatever is still queued so a restart never overlaps it.
      for (const src of this.sources) {
        try {
          src.stop();
        } catch {
          /* not started */
        }
      }
      this.sources.clear();
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);
    src.onended = () => this.sources.delete(src);
    src.start(s.start);
    this.sources.add(src);
    this.next = s.next;
    this.played++;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  private applyGain() {
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.015);
  }

  stop(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.gain = null;
    this.sources.clear();
    this.next = 0;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
