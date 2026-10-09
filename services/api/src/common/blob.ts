import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { ObjectStorage } from '../storage/storage.service.js';

/** File types the small evidence and attachment uploads accept. Everything is served as a download, never inline. */
export const BLOB_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
] as const;

/** A small file sent inside a JSON body (base64), for attachments that are not worth a multipart route. */
export const BlobBody = z.object({
  filename: z.string().trim().min(1).max(160),
  contentType: z.enum(BLOB_TYPES),
  contentBase64: z.string().min(4).max(6_000_000),
});
export type BlobInput = z.infer<typeof BlobBody>;

const MAX_BYTES = 4_000_000;

/** Whether the bytes look like the type the sender claims (magic numbers for binary types, no control bytes for text). */
export function matchesType(buf: Buffer, contentType: string): boolean {
  const starts = (...b: number[]) => b.every((x, i) => buf[i] === x);
  switch (contentType) {
    case 'application/pdf':
      return buf.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47);
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'video/mp4':
      return buf.subarray(4, 8).toString('latin1') === 'ftyp';
    case 'text/plain':
    case 'text/csv':
    case 'application/json':
      return !buf.subarray(0, 4096).includes(0);
    default:
      // zip, docx, xlsx, pptx
      return starts(0x50, 0x4b);
  }
}

/** Stores the file under `tenants/<tenant>/<area>/…` and returns what the table keeps. */
export async function putBlob(storage: ObjectStorage, tenantId: string, area: string, b: BlobInput): Promise<{ storageKey: string; sizeBytes: number; contentType: string; title: string }> {
  const buf = Buffer.from(b.contentBase64, 'base64');
  if (buf.length === 0) throw new BadRequestException('The file is empty');
  if (buf.length > MAX_BYTES) throw new BadRequestException('Files here can be up to 4 MB');
  if (!matchesType(buf, b.contentType)) throw new BadRequestException('The file does not look like its type');
  const ext = (b.filename.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? 'bin').toLowerCase();
  const storageKey = `tenants/${tenantId}/${area}/${randomUUID()}.${ext}`;
  await storage.put(storageKey, Readable.from(buf), MAX_BYTES, b.contentType);
  return { storageKey, sizeBytes: buf.length, contentType: b.contentType, title: b.filename };
}

/** Streams a stored file as a download. */
export async function sendBlob(storage: ObjectStorage, res: Response, row: { storageKey: string | null; contentType: string | null; title: string }): Promise<StreamableFile> {
  if (!row.storageKey) throw new BadRequestException('This item is a link, not a file');
  const { stream } = await storage.get(row.storageKey);
  res.setHeader('Content-Type', row.contentType ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${row.title.replace(/[^A-Za-z0-9._ -]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(stream);
}
