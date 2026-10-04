import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Env } from '../config/env.js';

export class TooLargeError extends Error {}

export interface StoredObject {
  stream: Readable;
  /** Total size of the object, whatever range was asked for. */
  size: number;
}

/** Object storage for recordings. Keys look like `tenants/<id>/recordings/<id>/audio`. */
export abstract class ObjectStorage {
  /** Stores a stream, failing with {@link TooLargeError} past `maxBytes`. Returns the size. */
  abstract put(key: string, body: Readable, maxBytes: number, contentType: string): Promise<number>;
  abstract get(key: string, range?: { start: number; end: number }): Promise<StoredObject>;
  abstract size(key: string): Promise<number | null>;
  abstract delete(key: string): Promise<void>;
}

/** Counts bytes going through and fails once there are too many. */
function limiter(maxBytes: number, count: { n: number }): Transform {
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      count.n += chunk.length;
      if (count.n > maxBytes) done(new TooLargeError(`Larger than ${maxBytes} bytes`));
      else done(null, chunk);
    },
  });
}

/** Development storage on local disk. Writes go to a temp file and are renamed when complete. */
export class LocalDiskStorage extends ObjectStorage {
  private readonly root: string;

  constructor(dir: string) {
    super();
    this.root = resolve(dir);
  }

  private path(key: string): string {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root + '/')) throw new Error('Bad storage key');
    return p;
  }

  async put(key: string, body: Readable, maxBytes: number): Promise<number> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${Date.now()}.part`;
    const count = { n: 0 };
    try {
      await pipeline(body, limiter(maxBytes, count), createWriteStream(tmp));
      await rename(tmp, path);
      return count.n;
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }

  async get(key: string, range?: { start: number; end: number }): Promise<StoredObject> {
    const path = this.path(key);
    const { size } = await stat(path);
    return { stream: createReadStream(path, range), size };
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

/** Production storage: S3 in ap-south-1 (Mumbai), encrypted at rest by the bucket policy. */
export class S3Storage extends ObjectStorage {
  private readonly s3: S3Client;

  constructor(
    private readonly bucket: string,
    region: string,
  ) {
    super();
    this.s3 = new S3Client({ region });
  }

  async put(key: string, body: Readable, maxBytes: number, contentType: string): Promise<number> {
    const count = { n: 0 };
    const pass = new PassThrough();
    const counted = pipeline(body, limiter(maxBytes, count), pass);
    const upload = new Upload({ client: this.s3, params: { Bucket: this.bucket, Key: key, Body: pass, ContentType: contentType } });
    try {
      await Promise.all([counted, upload.done()]);
    } catch (e) {
      await upload.abort().catch(() => undefined);
      throw e;
    }
    return count.n;
  }

  async get(key: string, range?: { start: number; end: number }): Promise<StoredObject> {
    const size = await this.size(key);
    if (size === null) throw new Error('Not found');
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }));
    return { stream: res.Body as Readable, size };
  }

  async size(key: string): Promise<number | null> {
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? 0;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function storageFromEnv(env: Env): ObjectStorage {
  return env.STORAGE_DRIVER === 's3' ? new S3Storage(env.S3_BUCKET!, env.S3_REGION) : new LocalDiskStorage(env.STORAGE_DIR);
}

export function bufferStream(buf: Buffer): Readable {
  return Readable.from([buf]);
}
