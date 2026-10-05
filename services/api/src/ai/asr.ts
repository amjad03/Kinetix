import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Logger } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { DbService } from '../db/db.service.js';
import { aiUsage } from '../db/schema.js';
import { AiUnavailableError, checkedFetch, runChain, type ChainLink } from './providers.js';

const run = promisify(execFile);

/** Who the audio belongs to: for the monthly cap and the usage record. */
export interface AsrContext {
  tenantId: string;
  /** Length of the audio; probed with ffprobe when missing. */
  durationMs?: number;
  userId?: string | null;
  deviceId?: string | null;
}

/** Speech to text. Every implementation must run in India. */
export abstract class SpeechToText {
  abstract readonly configured: boolean;
  readonly name: string = 'none';
  readonly model: string = 'none';
  /** `language` is the recording language: en, hi or kn. */
  abstract transcribe(audio: Buffer, mime: string, language: string, ctx?: AsrContext): Promise<string>;
  /** Estimated rupees for this much audio (pay-per-use providers). */
  costInr(_durationMs: number): number | undefined {
    return undefined;
  }
}

/** The institution has used its monthly transcription hours. Not retried by the fallback. */
export class AsrQuotaError extends Error {
  readonly code = 'ASR_MONTHLY_LIMIT';
}

export const extensionFor = (mime: string) =>
  mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('webm') ? 'webm' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : 'wav';

const trimSlash = (u: string) => u.replace(/\/$/, '');

/** An OpenAI-compatible /audio/transcriptions server: faster-whisper-server, vLLM, others. */
export class OpenAiCompatibleAsr extends SpeechToText {
  readonly configured = true;
  override readonly name = 'openai-compatible';

  constructor(
    private readonly baseUrl: string,
    override readonly model: string,
    private readonly apiKey: string | undefined,
  ) {
    super();
  }

  async transcribe(audio: Buffer, mime: string, language: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `lesson.${extensionFor(mime)}`);
    form.append('model', this.model);
    form.append('language', language);
    form.append('response_format', 'json');
    const res = await checkedFetch('Speech server', `${trimSlash(this.baseUrl)}/audio/transcriptions`, {
      method: 'POST',
      headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
      body: form,
      signal: AbortSignal.timeout(30 * 60_000),
    });
    const body = (await res.json()) as { text?: string };
    if (typeof body.text !== 'string') throw new Error('Speech server sent no text');
    return body.text.trim();
  }
}

/** Sarvam's BCP-47 codes for the recording languages. */
export const SARVAM_LANGUAGES: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };

export interface SarvamAsrOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  inrPerHour: number;
  /** The REST endpoint takes clips up to 30 s; anything longer goes to the batch API. */
  restMaxSeconds?: number;
  /** Batch API limit per file (2 h); longer audio is split with ffmpeg. */
  batchMaxSeconds?: number;
  /** Size of each piece when splitting. */
  chunkSeconds?: number;
  /** Batch API limit on files per job. */
  maxFiles?: number;
  pollMs?: number;
  /** Stays under the job runner's 15-minute stale-lock window. */
  batchTimeoutMs?: number;
}

type BatchOutput = { transcript?: string; diarized_transcript?: { entries?: { transcript?: string }[] }; segments?: { text?: string }[] };

/**
 * Sarvam AI speech-to-text (Saaras). Short clips use `POST /speech-to-text`; lesson recordings
 * use the batch job API (`/speech-to-text/job/v1`: create, get upload links, PUT the audio,
 * start, poll status, get download links, read the JSON output). Audio longer than one batch
 * file allows is split with ffmpeg into pieces of one job, joined in order.
 */
export class SarvamAsr extends SpeechToText {
  readonly configured = true;
  override readonly name = 'sarvam';
  override readonly model: string;
  private readonly o: Required<SarvamAsrOptions>;

  constructor(opts: SarvamAsrOptions) {
    super();
    this.o = { restMaxSeconds: 30, batchMaxSeconds: 2 * 3600, chunkSeconds: 3600, maxFiles: 20, pollMs: 5000, batchTimeoutMs: 14 * 60_000, ...opts };
    this.model = opts.model;
  }

  override costInr(durationMs: number): number {
    return (durationMs / 3_600_000) * this.o.inrPerHour;
  }

  async transcribe(audio: Buffer, mime: string, language: string, ctx?: AsrContext): Promise<string> {
    const languageCode = SARVAM_LANGUAGES[language] ?? 'unknown';
    const ext = extensionFor(mime);
    const seconds = (ctx?.durationMs || (await probeDurationMs(audio, ext))) / 1000;
    if (seconds > 0 && seconds <= this.o.restMaxSeconds) return this.rest(audio, mime, ext, languageCode);
    const parts = seconds > this.o.batchMaxSeconds ? await splitAudio(audio, ext, this.o.chunkSeconds) : [audio];
    if (parts.length > this.o.maxFiles) throw new AiUnavailableError(`Recording too long for one Sarvam batch job (${parts.length} parts)`, false);
    return this.batch(
      parts.map((data, i) => ({ name: `part-${String(i).padStart(3, '0')}.${ext}`, data })),
      mime,
      languageCode,
    );
  }

  private headers(json = true): Record<string, string> {
    return { 'api-subscription-key': this.o.apiKey, ...(json ? { 'content-type': 'application/json' } : {}) };
  }

  private url(path: string) {
    return `${trimSlash(this.o.baseUrl)}/${path}`;
  }

  private async rest(audio: Buffer, mime: string, ext: string, languageCode: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `lesson.${ext}`);
    form.append('model', this.model);
    form.append('mode', 'transcribe');
    form.append('language_code', languageCode);
    const res = await checkedFetch('Sarvam speech-to-text', this.url('speech-to-text'), { method: 'POST', headers: this.headers(false), body: form, signal: AbortSignal.timeout(120_000) });
    const body = (await res.json()) as { transcript?: string };
    if (typeof body.transcript !== 'string') throw new AiUnavailableError('Sarvam speech-to-text sent no transcript');
    return body.transcript.trim();
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await checkedFetch('Sarvam batch speech-to-text', this.url(path), {
      method: 'POST',
      headers: this.headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    return (await res.json()) as T;
  }

  private async batch(files: { name: string; data: Buffer }[], mime: string, languageCode: string): Promise<string> {
    const { job_id: jobId } = await this.post<{ job_id: string }>('speech-to-text/job/v1', {
      job_parameters: { model: this.model, mode: 'transcribe', language_code: languageCode, with_timestamps: false },
    });
    const links = await this.post<{ upload_urls: Record<string, { file_url: string }> }>('speech-to-text/job/v1/upload-files', { job_id: jobId, files: files.map((f) => f.name) });
    for (const f of files) {
      const target = links.upload_urls[f.name]?.file_url;
      if (!target) throw new AiUnavailableError(`Sarvam gave no upload link for ${f.name}`);
      await checkedFetch('Sarvam upload', target, {
        method: 'PUT',
        headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': mime },
        body: new Uint8Array(f.data),
        signal: AbortSignal.timeout(10 * 60_000),
      });
    }
    await this.post(`speech-to-text/job/v1/${encodeURIComponent(jobId)}/start`);

    type Status = { job_state: string; error_message?: string; job_details?: { inputs?: { file_name: string }[]; outputs?: { file_name: string }[]; state?: string; error_message?: string }[] };
    const deadline = Date.now() + this.o.batchTimeoutMs;
    let status: Status;
    for (;;) {
      const res = await checkedFetch('Sarvam batch status', this.url(`speech-to-text/job/v1/${encodeURIComponent(jobId)}/status`), { headers: this.headers(false), signal: AbortSignal.timeout(30_000) });
      status = (await res.json()) as Status;
      const state = status.job_state.toLowerCase();
      if (state === 'completed') break;
      if (state === 'failed') throw new AiUnavailableError(`Sarvam batch job ${jobId} failed: ${status.error_message ?? 'no reason given'}`);
      if (Date.now() > deadline) throw new AiUnavailableError(`Sarvam batch job ${jobId} did not finish in time`);
      await new Promise((r) => setTimeout(r, this.o.pollMs));
    }

    // Output files in input order (part-000, part-001, ...).
    const done = (status.job_details ?? [])
      .filter((d) => d.state === 'Success' && d.inputs?.length && d.outputs?.length)
      .map((d) => ({ input: d.inputs![0].file_name, output: d.outputs![0].file_name }))
      .sort((a, b) => a.input.localeCompare(b.input));
    if (done.length < files.length) {
      const bad = (status.job_details ?? []).find((d) => d.state !== 'Success');
      throw new AiUnavailableError(`Sarvam batch job ${jobId}: ${files.length - done.length} file(s) failed${bad?.error_message ? `: ${bad.error_message}` : ''}`);
    }
    const dl = await this.post<{ download_urls: Record<string, { file_url: string }> }>('speech-to-text/job/v1/download-files', { job_id: jobId, files: done.map((d) => d.output) });
    const texts: string[] = [];
    for (const d of done) {
      const target = dl.download_urls[d.output]?.file_url;
      if (!target) throw new AiUnavailableError(`Sarvam gave no download link for ${d.output}`);
      const out = (await (await checkedFetch('Sarvam download', target, { signal: AbortSignal.timeout(120_000) })).json()) as BatchOutput;
      const text = typeof out.transcript === 'string' ? out.transcript : (out.diarized_transcript?.entries ?? out.segments ?? []).map((e) => ('transcript' in e ? e.transcript : (e as { text?: string }).text) ?? '').join(' ');
      texts.push(text.trim());
    }
    return texts.filter(Boolean).join('\n');
  }
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'kinetix-asr-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The audio's length in ms from ffprobe; 0 when it cannot be read (or ffprobe is missing). */
export async function probeDurationMs(audio: Buffer, ext: string): Promise<number> {
  return withTemp(async (dir) => {
    const file = join(dir, `in.${ext}`);
    await writeFile(file, audio);
    try {
      const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
      const s = Number.parseFloat(stdout.trim());
      return Number.isFinite(s) ? Math.round(s * 1000) : 0;
    } catch {
      return 0;
    }
  });
}

/** Splits audio into pieces of `seconds` with ffmpeg (stream copy, no re-encoding). */
export async function splitAudio(audio: Buffer, ext: string, seconds: number): Promise<Buffer[]> {
  return withTemp(async (dir) => {
    const file = join(dir, `in.${ext}`);
    await writeFile(file, audio);
    try {
      await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'segment', '-segment_time', String(seconds), '-c', 'copy', '-reset_timestamps', '1', join(dir, `part-%03d.${ext}`)]);
    } catch (e) {
      throw new AiUnavailableError(`Could not split the recording with ffmpeg: ${(e as Error).message.slice(0, 200)}`, false);
    }
    const names = (await readdir(dir)).filter((n) => n.startsWith('part-')).sort();
    return Promise.all(names.map((n) => readFile(join(dir, n))));
  });
}

/**
 * The speech-to-text gateway: the monthly hours cap per institution, the local-first chain
 * (self-hosted ASR, then Sarvam), and a usage row per recording in ai_usage (task `transcribe`).
 */
export class AsrGateway extends SpeechToText {
  readonly configured = true;
  override readonly name: string;
  override readonly model: string;
  private readonly log = new Logger('AsrGateway');

  constructor(
    private readonly links: ChainLink<SpeechToText>[],
    private readonly db: DbService,
    private readonly monthlyHours: number,
  ) {
    super();
    this.name = links[0].provider.name;
    this.model = links[0].provider.model;
  }

  async transcribe(audio: Buffer, mime: string, language: string, ctx?: AsrContext): Promise<string> {
    const durationMs = ctx?.durationMs || (await probeDurationMs(audio, extensionFor(mime)));
    const call = { ...ctx, durationMs } as AsrContext;
    if (ctx && this.monthlyHours > 0) {
      const usedMs = await this.db.withTenant(ctx.tenantId, async (tx) => {
        const [row] = await tx
          .select({ ms: sql<number>`coalesce(sum(${aiUsage.audioMs}), 0)::bigint` })
          .from(aiUsage)
          .where(and(eq(aiUsage.task, 'transcribe'), eq(aiUsage.outcome, 'ok'), gte(aiUsage.createdAt, sql`date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'`)));
        return Number(row?.ms ?? 0);
      });
      if (usedMs + durationMs > this.monthlyHours * 3_600_000) {
        await this.record(call, 'quota', this.links[0].provider, { detail: `ASR_MONTHLY_LIMIT: ${(usedMs / 3_600_000).toFixed(1)} of ${this.monthlyHours} h used` });
        throw new AsrQuotaError(`ASR_MONTHLY_LIMIT: this institution has used its ${this.monthlyHours} hours of lesson transcription for the month`);
      }
    }
    const started = Date.now();
    let served = this.links[0].provider;
    try {
      const text = await runChain(this.links, (p) => ((served = p), p.transcribe(audio, mime, language, call)), this.log, 'Speech-to-text');
      const costInr = served.costInr(durationMs);
      if (costInr !== undefined) this.log.log(`Transcribed ${(durationMs / 60_000).toFixed(1)} min with ${served.name} (${served.model}): about ₹${costInr.toFixed(2)}`);
      if (ctx) await this.record(call, 'ok', served, { latencyMs: Date.now() - started, costInr });
      return text;
    } catch (e) {
      if (ctx) await this.record(call, 'unavailable', served, { latencyMs: Date.now() - started, detail: (e as Error).message.slice(0, 500) });
      throw e;
    }
  }

  private async record(ctx: AsrContext, outcome: 'ok' | 'unavailable' | 'quota', p: SpeechToText, extra: { latencyMs?: number; detail?: string; costInr?: number }) {
    await this.db.withTenant(ctx.tenantId, (tx) =>
      tx.insert(aiUsage).values({
        tenantId: ctx.tenantId,
        userId: ctx.userId ?? null,
        deviceId: ctx.deviceId ?? null,
        task: 'transcribe',
        outcome,
        provider: p.name,
        model: p.model,
        promptVersion: 'asr',
        audioMs: outcome === 'ok' ? (ctx.durationMs ?? 0) : 0,
        latencyMs: extra.latencyMs ?? 0,
        detail: extra.detail,
        estCostInr: extra.costInr ?? null,
      }),
    );
  }
}

/** No speech server: recordings play without a transcript. */
export class NoSpeechToText extends SpeechToText {
  readonly configured = false;
  transcribe(): Promise<string> {
    throw new Error('No speech-to-text server is configured');
  }
}
