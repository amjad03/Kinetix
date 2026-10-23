import { Injectable } from '@nestjs/common';
import { assertSafeUrl } from '../connectors/safe-url.js';

export interface CloudRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: Buffer | string;
}
export interface CloudResponse {
  status: number;
  contentType: string;
  body: Buffer;
}

/** The cloud adapters' only way to the network (binary bodies both ways). The e2e tests point the connectors' API URLs at local fakes. */
export abstract class CloudHttp {
  abstract request(url: string, r: CloudRequest): Promise<CloudResponse>;
}

@Injectable()
export class FetchCloudHttp extends CloudHttp {
  async request(url: string, r: CloudRequest): Promise<CloudResponse> {
    assertSafeUrl(url);
    const res = await fetch(url, { method: r.method, headers: r.headers, body: r.body as BodyInit | undefined, signal: AbortSignal.timeout(120_000) });
    return { status: res.status, contentType: res.headers.get('content-type') ?? 'application/octet-stream', body: Buffer.from(await res.arrayBuffer()) };
  }
}

/** A multipart/form-data or multipart/related body built by hand (Drive's metadata + media upload, Moodle's file upload). */
export function multipart(kind: 'form-data' | 'related', parts: { name?: string; filename?: string; contentType?: string; body: Buffer | string }[]): { contentType: string; body: Buffer } {
  const boundary = `zynetix${Math.random().toString(16).slice(2)}${Date.now()}`;
  const chunks: Buffer[] = [];
  for (const p of parts) {
    const head = [`--${boundary}`];
    if (kind === 'form-data') head.push(`Content-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename.replace(/"/g, '')}"` : ''}`);
    if (p.contentType) head.push(`Content-Type: ${p.contentType}`);
    chunks.push(Buffer.from(`${head.join('\r\n')}\r\n\r\n`), Buffer.isBuffer(p.body) ? p.body : Buffer.from(p.body), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { contentType: `multipart/${kind}; boundary=${boundary}`, body: Buffer.concat(chunks) };
}
