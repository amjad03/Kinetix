import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SecretBox } from '../common/secret-box.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { aiConnections } from '../db/schema.js';
import { AiUnavailableError, CircuitBreaker, FallbackProvider, OpenAiCompatibleProvider, type LlmProvider } from './providers.js';

export const CLAUDE_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] as const;
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_FALLBACK_MODEL = 'claude-haiku-5-5';
export const KEY_REJECTED = 'The key was rejected by Anthropic';
export const AI_SECRETS_KEY_MISSING = 'AI keys cannot be stored on this server yet (SECRETS_ENCRYPTION_KEY is not set)';
/** How long a resolved provider is reused; changes made through this instance invalidate it at once. */
const CACHE_MS = 60_000;

const aad = (tenantId: string) => `${tenantId}:ai.anthropic.api_key`;

export interface AiConnectionView {
  provider: 'anthropic';
  model: string;
  fallbackModel: string | null;
  keySet: boolean;
  keyHint: string | null;
  updatedAt: Date | null;
  /** Whose AI answers this institution: its own key, the server's configuration, or none (previews). */
  source: 'institution' | 'server' | 'none';
}

export interface StoredConnection {
  apiKey: string;
  model: string;
  fallbackModel: string | null;
}

/**
 * An institution's own Claude connection, pasted into the Zynetix dashboard instead of set in the
 * server's environment. The key is encrypted at rest with SECRETS_ENCRYPTION_KEY (like payment
 * secrets) and never returned. AI requests from an institution with a key go to Anthropic's
 * OpenAI-compatible endpoint with it; others use the server's provider.
 */
@Injectable()
export class AiConnections {
  private readonly box: SecretBox | undefined;
  private readonly cache = new Map<string, { at: number; provider: Promise<LlmProvider | null> }>();

  constructor(
    private readonly db: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.box = SecretBox.fromEnv(env);
  }

  /** The institution's own provider, or null to use the server's. Cached per institution. */
  forTenant(tenantId: string): Promise<LlmProvider | null> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.provider;
    const provider = this.db.withTenant(tenantId, (tx) => this.stored(tx)).then((c) => (c ? this.build(c) : null));
    provider.catch(() => this.cache.delete(tenantId));
    this.cache.set(tenantId, { at: Date.now(), provider });
    return provider;
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /** The model chain for a connection: the chosen model, then the fallback model when busy or down. */
  build(c: StoredConnection, withFallback = true): LlmProvider {
    const make = (model: string) => new OpenAiCompatibleProvider(this.env.ANTHROPIC_BASE_URL, model, c.apiKey, this.env.AI_TIMEOUT_MS, true);
    const models = [...new Set([c.model, ...(withFallback && c.fallbackModel ? [c.fallbackModel] : [])])];
    if (models.length === 1) return make(models[0]);
    return new FallbackProvider(models.map((m) => ({ provider: make(m), breaker: new CircuitBreaker(this.env.AI_BREAKER_FAILURES, this.env.AI_BREAKER_COOLDOWN_S * 1000) })));
  }

  /** The current institution's decrypted connection, or null. */
  async stored(tx: Tx): Promise<StoredConnection | null> {
    const [row] = await tx.select().from(aiConnections);
    if (!row || !this.box) return null;
    return { apiKey: this.box.decrypt(row.apiKeyEnc, aad(row.tenantId)), model: row.model, fallbackModel: row.fallbackModel };
  }

  async view(tx: Tx, server: LlmProvider): Promise<AiConnectionView> {
    const [row] = await tx.select().from(aiConnections);
    return {
      provider: 'anthropic',
      model: row?.model ?? DEFAULT_MODEL,
      fallbackModel: row ? row.fallbackModel : DEFAULT_FALLBACK_MODEL,
      keySet: !!row,
      keyHint: row?.apiKeyLast4 ?? null,
      updatedAt: row?.updatedAt ?? null,
      source: row && this.box ? 'institution' : server.preview ? 'none' : 'server',
    };
  }

  /** Saves the connection; a key left out keeps the stored one (a first save needs one). Returns what changed, never the key. */
  async save(tx: Tx, tenantId: string, userId: string, input: { apiKey?: string; model?: string; fallbackModel?: string | null }) {
    if (!this.box) throw new ServiceUnavailableException(AI_SECRETS_KEY_MISSING);
    const [row] = await tx.select().from(aiConnections);
    const values = {
      ...(input.apiKey ? { apiKeyEnc: this.box.encrypt(input.apiKey, aad(tenantId)), apiKeyLast4: input.apiKey.slice(-4) } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.fallbackModel !== undefined ? { fallbackModel: input.fallbackModel } : {}),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    if (row) await tx.update(aiConnections).set(values).where(eq(aiConnections.tenantId, tenantId));
    else await tx.insert(aiConnections).values({ tenantId, apiKeyEnc: '', apiKeyLast4: '', ...values });
    this.invalidate(tenantId);
    return {
      created: !row,
      keyChanged: !!input.apiKey,
      model: input.model ?? row?.model ?? DEFAULT_MODEL,
      fallbackModel: input.fallbackModel !== undefined ? input.fallbackModel : (row?.fallbackModel ?? DEFAULT_FALLBACK_MODEL),
    };
  }

  async remove(tx: Tx, tenantId: string): Promise<boolean> {
    const deleted = await tx.delete(aiConnections).where(eq(aiConnections.tenantId, tenantId)).returning({ tenantId: aiConnections.tenantId });
    this.invalidate(tenantId);
    return deleted.length > 0;
  }

  /** One tiny real completion on the primary model (no fallback), timed. */
  async test(provider: LlmProvider): Promise<{ ok: true; model: string; latencyMs: number } | { ok: false; error: string }> {
    const started = Date.now();
    try {
      const out = await provider.complete([{ role: 'user', content: 'Reply with the JSON object {"ok": true} and nothing else.' }], { maxTokens: 16, temperature: 0 });
      return { ok: true, model: out.model ?? provider.model, latencyMs: Date.now() - started };
    } catch (e) {
      if (e instanceof AiUnavailableError && (e.status === 401 || e.status === 403)) return { ok: false, error: KEY_REJECTED };
      return { ok: false, error: (e as Error).message.slice(0, 300) };
    }
  }
}
