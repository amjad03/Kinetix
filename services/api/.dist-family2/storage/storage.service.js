import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
export class TooLargeError extends Error {
}
/** Object storage for recordings. Keys look like `tenants/<id>/recordings/<id>/audio`. */
export class ObjectStorage {
}
/** Counts bytes going through and fails once there are too many. */
function limiter(maxBytes, count) {
    return new Transform({
        transform(chunk, _enc, done) {
            count.n += chunk.length;
            if (count.n > maxBytes)
                done(new TooLargeError(`Larger than ${maxBytes} bytes`));
            else
                done(null, chunk);
        },
    });
}
/** Development storage on local disk. Writes go to a temp file and are renamed when complete. */
export class LocalDiskStorage extends ObjectStorage {
    constructor(dir) {
        super();
        this.root = resolve(dir);
    }
    path(key) {
        const p = resolve(join(this.root, key));
        if (!p.startsWith(this.root + '/'))
            throw new Error('Bad storage key');
        return p;
    }
    async put(key, body, maxBytes) {
        const path = this.path(key);
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.${Date.now()}.part`;
        const count = { n: 0 };
        try {
            await pipeline(body, limiter(maxBytes, count), createWriteStream(tmp));
            await rename(tmp, path);
            return count.n;
        }
        catch (e) {
            await rm(tmp, { force: true });
            throw e;
        }
    }
    async get(key, range) {
        const path = this.path(key);
        const { size } = await stat(path);
        return { stream: createReadStream(path, range), size };
    }
    async size(key) {
        try {
            return (await stat(this.path(key))).size;
        }
        catch {
            return null;
        }
    }
    async delete(key) {
        await rm(this.path(key), { force: true });
    }
}
/** Production storage: S3 in ap-south-1 (Mumbai), encrypted at rest by the bucket policy. */
export class S3Storage extends ObjectStorage {
    constructor(bucket, region) {
        super();
        this.bucket = bucket;
        this.s3 = new S3Client({ region });
    }
    async put(key, body, maxBytes, contentType) {
        const count = { n: 0 };
        const pass = new PassThrough();
        const counted = pipeline(body, limiter(maxBytes, count), pass);
        const upload = new Upload({ client: this.s3, params: { Bucket: this.bucket, Key: key, Body: pass, ContentType: contentType } });
        try {
            await Promise.all([counted, upload.done()]);
        }
        catch (e) {
            await upload.abort().catch(() => undefined);
            throw e;
        }
        return count.n;
    }
    async get(key, range) {
        const size = await this.size(key);
        if (size === null)
            throw new Error('Not found');
        const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }));
        return { stream: res.Body, size };
    }
    async size(key) {
        try {
            const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
            return head.ContentLength ?? 0;
        }
        catch {
            return null;
        }
    }
    async delete(key) {
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }
}
export function storageFromEnv(env) {
    return env.STORAGE_DRIVER === 's3' ? new S3Storage(env.S3_BUCKET, env.S3_REGION) : new LocalDiskStorage(env.STORAGE_DIR);
}
export function bufferStream(buf) {
    return Readable.from([buf]);
}
//# sourceMappingURL=storage.service.js.map