import type { ChatMessage } from './tasks.js';

export interface Completion {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

/** A model server. Every implementation must run in India (see docs/architecture/ai-platform.md). */
export interface LlmProvider {
  /** "openai-compatible" or "preview". */
  readonly name: string;
  readonly model: string;
  /** True when answers are fixed placeholders, not model output. */
  readonly preview: boolean;
  complete(messages: ChatMessage[], opts: { maxTokens: number; temperature: number }): Promise<Completion>;
}

export class AiUnavailableError extends Error {}

/**
 * Any server that speaks the OpenAI chat-completions API: vLLM or llama.cpp on our GPUs in
 * AWS Mumbai, or an Indian GPU cloud. Requests ask for a JSON object response.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  readonly preview = false;

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  async complete(messages: ChatMessage[], opts: { maxTokens: number; temperature: number }): Promise<Completion> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
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
    } catch (e) {
      throw new AiUnavailableError(`AI server unreachable: ${(e as Error).message}`);
    }
    if (!res.ok) throw new AiUnavailableError(`AI server returned ${res.status}`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new AiUnavailableError('AI server sent an empty response');
    return { text, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0 };
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
