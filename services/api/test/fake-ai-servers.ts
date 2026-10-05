import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Parses a multipart body the way a server would, using the platform's Request. */
async function formFields(req: IncomingMessage, body: Buffer): Promise<Record<string, string | { size: number; name: string }>> {
  const form = await new Request('http://x/', { method: 'POST', headers: { 'content-type': req.headers['content-type']! }, body: new Uint8Array(body) }).formData();
  const out: Record<string, string | { size: number; name: string }> = {};
  for (const [k, v] of form.entries()) out[k] = typeof v === 'string' ? v : { size: v.size, name: v.name };
  return out;
}

const json = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));

abstract class FakeServer {
  private server!: Server;
  port = 0;
  get origin() {
    return `http://127.0.0.1:${this.port}`;
  }

  protected abstract handle(req: IncomingMessage, res: ServerResponse, body: Buffer): Promise<unknown>;

  async start() {
    this.server = createServer((req, res) => {
      readBody(req)
        .then((body) => this.handle(req, res, body))
        .catch((e) => json(res, 500, { error: String(e) }));
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.port = (this.server.address() as AddressInfo).port;
  }

  stop() {
    this.server.closeAllConnections();
    return new Promise((r) => this.server.close(r));
  }
}

/**
 * A self-hosted OpenAI-compatible server (vLLM + faster-whisper). `mode` makes it answer, fail
 * with a status code, or hang (to trigger the client timeout).
 */
export class FakePrimary extends FakeServer {
  mode: 'ok' | 'hang' | number = 'ok';
  chat: { model: string; messages: { role: string; content: unknown }[] }[] = [];
  asr: Record<string, unknown>[] = [];
  reply: unknown = { answer: 'Photosynthesis makes food from light.', keyPoints: ['Chlorophyll'], followUps: [] };
  get url() {
    return `${this.origin}/v1`;
  }

  protected async handle(req: IncomingMessage, res: ServerResponse, body: Buffer): Promise<unknown> {
    if (this.mode === 'hang') return; // never answers
    if (req.url === '/v1/chat/completions') {
      this.chat.push(JSON.parse(body.toString()));
      if (typeof this.mode === 'number') return json(res, this.mode, { error: 'primary says no' });
      return json(res, 200, { choices: [{ message: { content: JSON.stringify(this.reply) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
    }
    if (req.url === '/v1/audio/transcriptions') {
      this.asr.push(await formFields(req, body));
      if (typeof this.mode === 'number') return json(res, this.mode, { error: 'primary says no' });
      return json(res, 200, { text: ' Transcript from the college GPU. ' });
    }
    json(res, 404, {});
  }
}

/**
 * Sarvam AI as its SDK describes it: `api-subscription-key` auth, `/v1/chat/completions`,
 * `/speech-to-text` (REST, short clips) and the batch job API with presigned (Azure-style)
 * upload and download links.
 */
export class FakeSarvam extends FakeServer {
  static readonly KEY = 'sk-sarvam-test';
  chat: { headers: IncomingMessage['headers']; body: any }[] = [];
  rest: Record<string, unknown>[] = [];
  jobs: { id: string; params: any; files: Map<string, Buffer>; polls: number; started: boolean }[] = [];
  reply: unknown = { answer: 'Sarvam explains photosynthesis.', keyPoints: ['Sunlight'], followUps: [] };

  protected async handle(req: IncomingMessage, res: ServerResponse, body: Buffer): Promise<unknown> {
    const url = new URL(req.url!, this.origin);
    const p = url.pathname;
    // Presigned storage links carry their own auth.
    if (p.startsWith('/blob/') && req.method === 'PUT') {
      if (req.headers['x-ms-blob-type'] !== 'BlockBlob') return json(res, 400, { error: 'x-ms-blob-type missing' });
      const [, , jobId, name] = p.split('/');
      this.jobs.find((j) => j.id === jobId)!.files.set(decodeURIComponent(name), body);
      return res.writeHead(201).end();
    }
    if (p.startsWith('/out/')) {
      const [, , jobId, out] = p.split('/');
      const job = this.jobs.find((j) => j.id === jobId)!;
      const i = Number.parseInt(out, 10);
      const [name, data] = [...job.files.entries()].sort(([a], [b]) => a.localeCompare(b))[i];
      return json(res, 200, { request_id: 'r', transcript: `Part ${i} (${name}, ${data.length} bytes).`, language_code: job.params.language_code });
    }
    if (req.headers['api-subscription-key'] !== FakeSarvam.KEY) return json(res, 403, { error: { message: 'Invalid API key' } });

    if (p === '/v1/chat/completions') {
      this.chat.push({ headers: req.headers, body: JSON.parse(body.toString()) });
      return json(res, 200, {
        id: 'c1',
        object: 'chat.completion',
        created: 0,
        model: 'sarvam-105b',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(this.reply), reasoning_content: 'thinking' } }],
        usage: { prompt_tokens: 1_000_000, completion_tokens: 500_000, total_tokens: 1_500_000 },
      });
    }
    if (p === '/speech-to-text') {
      this.rest.push(await formFields(req, body));
      return json(res, 200, { request_id: 'r', transcript: 'Short clip from Sarvam.', language_code: 'kn-IN' });
    }
    if (p === '/speech-to-text/job/v1') {
      const id = `job-${this.jobs.length + 1}`;
      const params = JSON.parse(body.toString()).job_parameters;
      this.jobs.push({ id, params, files: new Map(), polls: 0, started: false });
      return json(res, 200, { job_id: id, storage_container_type: 'Azure', job_parameters: params, job_state: 'Accepted' });
    }
    if (p === '/speech-to-text/job/v1/upload-files') {
      const { job_id, files } = JSON.parse(body.toString()) as { job_id: string; files: string[] };
      const upload_urls = Object.fromEntries(files.map((f) => [f, { file_url: `${this.origin}/blob/${job_id}/${encodeURIComponent(f)}?sig=x` }]));
      return json(res, 200, { job_id, job_state: 'Accepted', upload_urls, storage_container_type: 'Azure' });
    }
    if (p === '/speech-to-text/job/v1/download-files') {
      const { job_id, files } = JSON.parse(body.toString()) as { job_id: string; files: string[] };
      const download_urls = Object.fromEntries(files.map((f) => [f, { file_url: `${this.origin}/out/${job_id}/${f}?sig=y` }]));
      return json(res, 200, { job_id, job_state: 'Completed', download_urls, storage_container_type: 'Azure' });
    }
    const m = /^\/speech-to-text\/job\/v1\/([^/]+)\/(start|status)$/.exec(p);
    if (m) {
      const job = this.jobs.find((j) => j.id === m[1]);
      if (!job) return json(res, 404, {});
      if (m[2] === 'start') {
        job.started = true;
        return json(res, 200, { job_id: job.id, job_state: 'Running' });
      }
      job.polls++;
      const names = [...job.files.keys()].sort();
      const completed = job.started && job.polls >= 2;
      return json(res, 200, {
        job_id: job.id,
        job_state: completed ? 'Completed' : 'Running',
        created_at: '',
        updated_at: '',
        storage_container_type: 'Azure',
        job_details: completed ? names.map((n, i) => ({ inputs: [{ file_name: n, file_id: `${i}` }], outputs: [{ file_name: `${i}.json`, file_id: `${i}` }], state: 'Success' })) : [],
      });
    }
    json(res, 404, {});
  }
}
