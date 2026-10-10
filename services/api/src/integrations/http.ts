import { PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';

/** The request body as bytes (for zip uploads and plain-text device pushes, which the JSON parser leaves alone). */
export async function readRawBody(req: Request, max: number): Promise<Buffer> {
  if (Number(req.headers['content-length'] ?? 0) > max) throw new PayloadTooLargeException('That file is too large');
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
