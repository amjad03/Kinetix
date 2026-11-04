import { PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The request body as bytes (for zip uploads and plain-text device pushes, which the JSON parser leaves alone).
 * A global parser may already have drained the stream (text/plain is parsed for Amazon SNS since the comms pass, CSV
 * as raw bytes): then its copy is used. Reading the drained stream gave an empty body, so every eSSL/ZKTeco ADMS
 * punch was answered "OK: 0" and dropped.
 */
export async function readRawBody(req: Request, max: number): Promise<Buffer> {
  if (Number(req.headers['content-length'] ?? 0) > max) throw new PayloadTooLargeException('That file is too large');
  const kept = (req as Request & { rawBody?: unknown }).rawBody;
  const parsed: unknown = req.body;
  const already = Buffer.isBuffer(kept) ? kept : Buffer.isBuffer(parsed) ? parsed : typeof parsed === 'string' ? Buffer.from(parsed, 'utf8') : null;
  if (already) {
    if (already.length > max) throw new PayloadTooLargeException('That file is too large');
    return already;
  }
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > max) throw new PayloadTooLargeException('That file is too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** Escapes text for an HTML attribute value. */
export const attrEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
