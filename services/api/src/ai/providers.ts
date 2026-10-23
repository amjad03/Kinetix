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
  /** Why the model stopped: "stop", or "length" when the reply was cut off at the token limit. */
  finishReason?: string;
}

export interface CompleteOptions {
  maxTokens: number;
  temperature: number;
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
  complete(messages: ChatMessage[], opts: CompleteOptions): Promise<Completion>;
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
    /** How long the server asked us to wait (Retry-After, Gemini's retryDelay); Infinity for a daily quota. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }

  /** Overloaded or rate-limited (429, 503): worth asking again shortly. */
  get busy(): boolean {
    return this.status === 429 || this.status === 503;
  }
}

/** The model's own safety filter withheld the answer. */
export class AiBlockedError extends Error {}

/** Retry elsewhere on overload or server faults, never on a request the server rejected. */
export const retryableStatus = (status: number) => status >= 500 || status === 429 || status === 408;

/**
 * The wait a "busy" reply asks for: the Retry-After header (seconds), or the retryDelay in a
 * Google error ("37s"). A daily quota (Google's PerDay quota ids) will not clear soon: Infinity.
 */
export function retryAfter(headers: Headers, body: string): number | undefined {
  if (/PerDay/i.test(body)) return Number.POSITIVE_INFINITY;
  const header = headers.get('retry-after')?.trim();
  if (header && /^\d+(\.\d+)?$/.test(header)) return Math.ceil(Number(header) * 1000);
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return delay ? Math.ceil(Number(delay[1]) * 1000) : undefined;
}

/**
 * For a Google quota error (429): which limit was hit, its size and the wait Google asks for, e.g.
 * "GenerateRequestsPerMinutePerProjectPerModel-FreeTier, limit 5, retry in 37s".
 */
export function quotaSummary(body: string): string | undefined {
  const id = /"quotaId"\s*:\s*"([^"]+)"/.exec(body)?.[1];
  if (!id) return undefined;
  const value = /"quotaValue"\s*:\s*"?(\d+)/.exec(body)?.[1];
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?s)"/.exec(body)?.[1];
  return [id, value && `limit ${value}`, delay && `retry in ${delay}`].filter(Boolean).join(', ');
}

/** Turns a failed fetch or a non-2xx response into an AiUnavailableError. */
export async function checkedFetch(what: string, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new AiUnavailableError(`${what} unreachable: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Google wraps the reason in {"error": {"message": …}}: the message alone reads better in the log.
    const message = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(body)?.[1];
    const detail = (message ?? body).replace(/\s+/g, ' ').trim().slice(0, 300);
    const quota = quotaSummary(body);
    throw new AiUnavailableError(
      `${what} returned ${res.status}${quota ? ` (${quota})` : ''}${detail ? `: ${detail}` : ''}`,
      retryableStatus(res.status),
      res.status,
      retryAfter(res.headers, body),
    );
  }
  return res;
}

export interface BackoffPolicy {
  /** Extra attempts after the first. */
  retries: number;
  /** The first wait; each later one doubles (with a little jitter). */
  baseMs: number;
  /** Gives up rather than wait longer than this (a daily quota, a long rate-limit window). */
  maxWaitMs: number;
}

/**
 * Calls again after a "busy" failure (429, 503): waits as long as the server asked, or baseMs,
 * then twice that… Other failures, and waits longer than maxWaitMs, are thrown at once.
 */
export async function withBackoff<T>(
  call: () => Promise<T>,
  policy: BackoffPolicy,
  onRetry?: (e: AiUnavailableError, waitMs: number, attempt: number) => void,
  sleep: (ms: number) => Promise<unknown> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (e) {
      if (!(e instanceof AiUnavailableError) || !e.busy || attempt >= policy.retries) throw e;
      const wait = e.retryAfterMs ?? Math.round(policy.baseMs * 2 ** attempt * (0.8 + Math.random() * 0.4));
      if (wait > policy.maxWaitMs) throw e;
      onRetry?.(e, wait, attempt + 1);
      await sleep(wait);
    }
  }
}

const trimSlash = (u: string) => u.replace(/\/+$/, '');

interface ChatBody {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function readCompletion(what: string, body: ChatBody): Omit<Completion, 'provider' | 'model'> {
  const choice = body.choices?.[0];
  const text = choice?.message?.content ?? '';
  const finishReason = choice?.finish_reason ?? undefined;
  if (typeof text !== 'string') throw new AiUnavailableError(`${what} sent an unexpected response`);
  if (!text.trim()) {
    if (finishReason && /content_filter|safety|recitation|prohibited|blocklist/i.test(finishReason)) throw new AiBlockedError(`${what} withheld the answer (${finishReason})`);
    // Cut off before any text (a thinking model spent the budget): the caller asks again with more room.
    if (finishReason !== 'length') throw new AiUnavailableError(`${what} sent an empty response`);
  }
  return { text, finishReason, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0 };
}

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

/** Thinking tokens a Gemini (3.x Flash) model may spend at each effort; they count against max_tokens. */
const THINKING_TOKENS: Record<ReasoningEffort, number> = { none: 0, low: 1024, medium: 8192, high: 24576 };

/** Google's OpenAI-compatible Gemini endpoint (https://generativelanguage.googleapis.com/v1beta/openai). */
export const isGemini = (baseUrl: string) => /generativelanguage\.googleapis\.com/i.test(baseUrl);

export interface OpenAiCompatibleOptions {
  /** `reasoning_effort` for thinking models. Unset: Gemini gets "low", other servers nothing. */
  reasoningEffort?: ReasoningEffort;
}

type OptionalField = 'response_format' | 'reasoning_effort' | 'temperature';

/**
 * Any server that speaks the OpenAI chat-completions API: vLLM or llama.cpp on a GPU in the
 * college, on E2E Networks or in AWS Mumbai, or Google Gemini's OpenAI-compatible endpoint.
 * Requests ask for a JSON object. An optional field the server turns down with a 400
 * (`response_format`, `reasoning_effort`) is left out from then on.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  readonly preview = false;
  private readonly log = new Logger('AiProviders');
  private readonly reasoningEffort?: ReasoningEffort;
  private readonly dropped = new Set<OptionalField>();

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs: number,
    readonly vision = true,
    options: OpenAiCompatibleOptions = {},
  ) {
    this.reasoningEffort = options.reasoningEffort ?? (isGemini(baseUrl) ? 'low' : undefined);
    // Anthropic's OpenAI-compatible endpoint refuses temperature for current Claude models.
    if (/anthropic\.com/i.test(baseUrl)) this.dropped.add('temperature');
  }

  async complete(messages: ChatMessage[], opts: CompleteOptions): Promise<Completion> {
    for (;;) {
      const effort = this.dropped.has('reasoning_effort') ? undefined : this.reasoningEffort;
      const body: Record<string, unknown> = {
        model: this.model,
        messages,
        // A thinking model's reasoning counts against max_tokens: leave room for it.
        max_tokens: opts.maxTokens + (effort ? THINKING_TOKENS[effort] : 0),
      };
      // Newer Claude models refuse temperature: left out once the server says so.
      if (!this.dropped.has('temperature')) body.temperature = opts.temperature;
      if (!this.dropped.has('response_format')) body.response_format = { type: 'json_object' };
      if (effort) body.reasoning_effort = effort;
      try {
        const res = await checkedFetch('AI server', `${trimSlash(this.baseUrl)}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        return { ...readCompletion('AI server', (await res.json()) as ChatBody), provider: this.name, model: this.model };
      } catch (e) {
        const field = this.rejectedField(e, body);
        if (!field) throw e;
        this.dropped.add(field);
        this.log.warn(`AI server (${this.model}) does not take ${field}; sending without it`);
      }
    }
  }

  /** The optional field a 400 complains about, when it was sent and can be left out. */
  private rejectedField(e: unknown, body: Record<string, unknown>): OptionalField | undefined {
    if (!(e instanceof AiUnavailableError) || e.status !== 400) return undefined;
    if ('reasoning_effort' in body && /reasoning|thinking/i.test(e.message)) return 'reasoning_effort';
    if ('response_format' in body && /response_format|json_object|mime/i.test(e.message)) return 'response_format';
    if ('temperature' in body && /temperature/i.test(e.message)) return 'temperature';
    return undefined;
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

  async complete(messages: ChatMessage[], opts: CompleteOptions): Promise<Completion> {
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
    const out = readCompletion('Sarvam AI', (await res.json()) as ChatBody);
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
export async function runChain<P extends { name: string; model?: string }, R>(links: ChainLink<P>[], call: (p: P) => Promise<R>, log: Logger, what: string): Promise<R> {
  // Several links may be the same kind of server with different models (AI_FALLBACK_MODELS): name both.
  const label = (p: P) => (p.model ? `${p.name} (${p.model})` : p.name);
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
      if (i < order.length - 1) log.warn(`${what} ${label(link.provider)} failed (${e.message.slice(0, 200)}); falling back to ${label(order[i + 1].provider)}`);
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

  complete(messages: ChatMessage[], opts: CompleteOptions): Promise<Completion> {
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

/**
 * LaTeX commands whose single backslash JSON would read as an escape (\b, \f, \n, \r, \t), so
 * "\frac" would arrive as a form feed and "rac". Only names that never follow a real escape.
 */
const LATEX_LIKE_ESCAPE =
  /(?<!\\)((?:\\\\)*)\\(?=(?:beta|bar|binom|boxed|begin|bigg?|frac|forall|right|rightarrow|rho|rangle|rfloor|rceil|tfrac|theta|tau|tanh?|times|textbf|textit|text|triangle|neq|nabla)(?![A-Za-z]))/g;
/** A backslash that starts no valid JSON escape (\alpha, \sqrt, \( …). */
const INVALID_ESCAPE = /(?<!\\)((?:\\\\)*)\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g;

/**
 * Parses a model reply that should be one JSON object, tolerating markdown fences, LaTeX
 * backslashes the model did not escape, and trailing commas.
 */
export function parseJsonReply(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SyntaxError('No JSON object in the reply');
  const json = trimmed.slice(start, end + 1).replace(LATEX_LIKE_ESCAPE, '$1\\\\');
  try {
    return JSON.parse(json);
  } catch (e) {
    const repaired = json.replace(INVALID_ESCAPE, '$1\\\\').replace(/,(\s*[}\]])/g, '$1');
    if (repaired === json) throw e;
    try {
      return JSON.parse(repaired);
    } catch {
      throw e;
    }
  }
}
