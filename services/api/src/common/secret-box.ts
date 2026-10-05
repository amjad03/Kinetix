import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption at rest for secrets kept in the database (each institution's Razorpay key secret
 * and webhook secret): AES-256-GCM with a master key from the environment, never from the
 * database. Each value is stored as `v<version>.<iv>.<tag>.<ciphertext>` (base64url), so the
 * master key can be rotated: add the new key with a higher version, keep the old one in
 * SECRETS_ENCRYPTION_OLD_KEYS until `pnpm secrets:rotate` has re-encrypted every row.
 *
 * The associated data (`aad`, e.g. "<tenantId>:razorpay.key_secret") binds a value to its row
 * and field, so a ciphertext copied to another institution or column does not decrypt.
 */
export class SecretBox {
  private readonly keys: Map<number, Buffer>;

  constructor(
    keys: Map<number, Buffer> | Record<number, Buffer>,
    readonly currentVersion: number,
  ) {
    this.keys = keys instanceof Map ? new Map(keys) : new Map(Object.entries(keys).map(([v, k]) => [Number(v), k]));
    for (const [v, k] of this.keys) {
      if (!Number.isInteger(v) || v < 1) throw new Error(`Bad secrets key version ${v}`);
      if (k.length !== 32) throw new Error(`Secrets key version ${v} must be 32 bytes`);
    }
    if (!this.keys.has(currentVersion)) throw new Error(`No secrets key for the current version ${currentVersion}`);
  }

  encrypt(plain: string, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.currentVersion)!, iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v' + this.currentVersion, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
  }

  decrypt(blob: string, aad: string): string {
    const [ver, iv, tag, ct] = blob.split('.');
    const version = SecretBox.versionOf(blob);
    const key = this.keys.get(version);
    if (!key || !ver || !iv || !tag || ct === undefined) throw new Error(`Cannot decrypt a secret encrypted with key version ${version}`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** True when the value was encrypted with an older key and should be re-encrypted. */
  isStale(blob: string): boolean {
    return SecretBox.versionOf(blob) !== this.currentVersion;
  }

  /** Re-encrypts a value with the current key (a no-op for values already on it). */
  rotate(blob: string, aad: string): string {
    return this.isStale(blob) ? this.encrypt(this.decrypt(blob, aad), aad) : blob;
  }

  static versionOf(blob: string): number {
    const m = /^v(\d+)\./.exec(blob);
    return m ? Number(m[1]) : NaN;
  }

  /** A key from the environment: 32 random bytes, base64 (`openssl rand -base64 32`). */
  static parseKey(b64: string): Buffer {
    const key = Buffer.from(b64.trim(), 'base64');
    if (key.length !== 32) throw new Error('A secrets encryption key must be 32 bytes, base64-encoded (openssl rand -base64 32)');
    return key;
  }

  /**
   * From SECRETS_ENCRYPTION_KEY (+ _VERSION, default 1) and SECRETS_ENCRYPTION_OLD_KEYS
   * ("1:<base64>,2:<base64>"). Undefined when no key is set.
   */
  static fromEnv(env: { SECRETS_ENCRYPTION_KEY?: string; SECRETS_ENCRYPTION_KEY_VERSION?: number; SECRETS_ENCRYPTION_OLD_KEYS?: string }): SecretBox | undefined {
    if (!env.SECRETS_ENCRYPTION_KEY) return undefined;
    const version = env.SECRETS_ENCRYPTION_KEY_VERSION ?? 1;
    const keys = new Map<number, Buffer>();
    for (const part of (env.SECRETS_ENCRYPTION_OLD_KEYS ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
      const i = part.indexOf(':');
      const v = Number(part.slice(0, i));
      if (i < 1 || !Number.isInteger(v)) throw new Error('SECRETS_ENCRYPTION_OLD_KEYS must look like "1:<base64>,2:<base64>"');
      keys.set(v, SecretBox.parseKey(part.slice(i + 1)));
    }
    keys.set(version, SecretBox.parseKey(env.SECRETS_ENCRYPTION_KEY));
    return new SecretBox(keys, version);
  }
}
