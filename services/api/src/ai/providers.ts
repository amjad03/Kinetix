import { Logger } from '@nestjs/common';
import type { ChatMessage } from './tasks.js';

export interface Completion {
  text: string;
  promptTokens: number;
  completionTokens: number;
  /** Which server answered (a fallback chain reports the link that served the call). */
  provider?: string;
  model?: string;
  /** Estimated cost in rupees, for pay-per-use providers. */
  costInr?: number;
}

/** A model server. Every implementation must run in India (see docs/architecture/ai-platform.md). */
export interface LlmProvider {
  /** "openai-compatible", "sarvam" or "preview". A fallback chain reports its primary. */
  readonly name: string;
  readonly model: string;
  /** Every model this provider may answer with (cache lookups accept any of them). */
  readonly models?: readonly string[];
  /** True when answers are fixed placeholders, not model output. */
  readonly preview: boolean;
  /** Accepts images (readBoard). Undefined means yes, for compatibility. */
  readonly vision?: boolean;
  complete(messages: ChatMessage[], opts: { maxTokens: number; temperature: number }): Promise<Completion>;
}

/**
 * The model or speech server could not answer. `retryable` failures (no connection, timeout,
 * 5xx, 429) move on to the fallback provider; others (4xx: the request itself is wrong) do not.
 */
export class AiUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Retry elsewhere on overload or server faults, never on a request the server rejected. */
export const retryableStatus = (status: number) => status >= 500 || status === 429 || status === 408;

/** Turns a failed fetch or a non-2xx response into an AiUnavailableError. */
export async function checkedFetch(what: string, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new AiUnavailableError(`${what} unreachable: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new AiUnavailableError(`${what} returned ${res.status}${detail ? `: ${detail}` : ''}`, retryableStatus(res.status), res.status);
  }
  return res;
}

const trimSlash = (u: string) => u.replace(/\/$/, '');

function readCompletion(what: string, body: { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }) {
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text) throw new AiUnavailableError(`${what} sent an empty response`);
  return { text, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0 };
}

/**
 * Any server that speaks the OpenAI chat-completions API: vLLM or llama.cpp on a GPU in the
 * college, on E2E Networks or in AWS Mumbai. Requests ask for a JSON object response.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  readonly preview = false;

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs: number,
    readonly vision = true,
  ) {}

  async complete(messages: ChatMessage[], opts: { maxTokens: number; temperature: number }): Promise<Completion> {
    const res = await checkedFetch('AI server', `${trimSlash(this.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return { ...readCompletion('AI server', await res.json()), provider: this.name, model: this.model };
  }
}

/** Rupees per million tokens, for cost estimates in the logs and ai_usage. */
export interface TokenRates {
  inputPerM: number;
  outputPerM: number;
}

/**
 * Sarvam AI's chat completions (Bengaluru; pay per token). `POST /v1/chat/completions` with the
 * `api-subscription-key` header; serves sarvam-105b. sarvam-105b reasons before answering, so
 * the token budget is doubled and reasoning effort kept low. Text only: readBoard is not sent here.
 */
export class SarvamProvider implements LlmProvider {
  readonly name = 'sarvam';
  readonly preview = false;
  readonly vision = false;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly rates: TokenRates,
    private readonly timeoutMs: number,
    private readonly baseUrl = 'https://api.sarvam.ai',
  ) {}

  async complete(messages: ChatMessage[], opts: { maxTokens: number; temperature: number }): Promise<Completion> {
    const res = await checkedFetch('Sarvam AI', `${trimSlash(this.baseUrl)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-subscription-key': this.apiKey },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts.maxTokens * 2,
        temperature: opts.temperature,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const out = readCompletion('Sarvam AI', await res.json());
    const costInr = (out.promptTokens * this.rates.inputPerM + out.completionTokens * this.rates.outputPerM) / 1e6;
    return { ...out, provider: this.name, model: this.model, costInr };
  }
}

/**
 * Stops sending work to a server that keeps failing: after `threshold` failures in a row it
 * is skipped for `cooldownMs`, then one call is let through to test it again.
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get open(): boolean {
    return this.now() < this.openUntil;
  }

  success(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  failure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.openUntil = this.now() + this.cooldownMs;
      // Half-open after the cooldown: one more failure re-opens it.
      this.failures = this.threshold - 1;
    }
  }
}

/** One provider and its breaker, tried in order. */
export interface ChainLink<P> {
  provider: P;
  breaker: CircuitBreaker;
}

/**
 * Runs `call` on each eligible link in turn: skips links whose breaker is open (unless all are),
 * moves on after a retryable failure, and stops at the first non-retryable one.
 */
export async function runChain<P extends { name: string }, R>(links: ChainLink<P>[], call: (p: P) => Promise<R>, log: Logger, what: string): Promise<R> {
  if (!links.length) throw new AiUnavailableError(`No ${what} server can take this request`, false);
  const closed = links.filter((l) => !l.breaker.open);
  const order = closed.length ? closed : links;
  let last: unknown;
  for (const [i, link] of order.entries()) {
    try {
      const out = await call(link.provider);
      link.breaker.success();
      return out;
    } catch (e) {
      last = e;
      if (!(e instanceof AiUnavailableError) || !e.retryable) throw e;
      link.breaker.failure();
      if (i < order.length - 1) log.warn(`${what} ${link.provider.name} failed (${e.message.slice(0, 200)}); falling back to ${order[i + 1].provider.name}`);
    }
  }
  throw last;
}

const hasImages = (messages: ChatMessage[]) => messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url'));

/**
 * The local-first chain: the self-hosted model first, then a pay-per-use Indian API. Image
 * requests only go to providers with `vision`; if none is left, the request is unavailable.
 */
export class FallbackProvider implements LlmProvider {
  readonly preview = false;
  private readonly log = new Logger('AiProviders');

  constructor(private readonly links: ChainLink<LlmProvider>[]) {}

  get name() {
    return this.links[0].provider.name;
  }
  get model() {
    return this.links[0].provider.model;
  }
  get models() {
    return this.links.map((l) => l.provider.model);
  }
  get vision() {
    return this.links.some((l) => l.provider.vision !== false);
  }

  complete(messages: ChatMessage[], opts: { maxTokens: number; temperature: number }): Promise<Completion> {
    const links = hasImages(messages) ? this.links.filter((l) => l.provider.vision !== false) : this.links;
    return runChain(links, (p) => p.complete(messages, opts), this.log, 'AI');
  }
}

/** No model: the service answers with each task's labelled preview instead of calling this. */
export class PreviewProvider implements LlmProvider {
  readonly name = 'preview';
  readonly model = 'preview';
  readonly preview = true;

  complete(): Promise<Completion> {
    throw new Error('PreviewProvider is never called; AiService uses previewOutput()');
  }
}

/** Parses a model reply that should be one JSON object, tolerating markdown fences. */
export function parseJsonReply(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SyntaxError('No JSON object in the reply');
  return JSON.parse(trimmed.slice(start, end + 1));
}
