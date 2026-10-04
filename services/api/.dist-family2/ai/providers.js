export class AiUnavailableError extends Error {
}
/**
 * Any server that speaks the OpenAI chat-completions API: vLLM or llama.cpp on our GPUs in
 * AWS Mumbai, or an Indian GPU cloud. Requests ask for a JSON object response.
 */
export class OpenAiCompatibleProvider {
    constructor(baseUrl, model, apiKey, timeoutMs) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.timeoutMs = timeoutMs;
        this.name = 'openai-compatible';
        this.preview = false;
    }
    async complete(messages, opts) {
        let res;
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
        }
        catch (e) {
            throw new AiUnavailableError(`AI server unreachable: ${e.message}`);
        }
        if (!res.ok)
            throw new AiUnavailableError(`AI server returned ${res.status}`);
        const body = (await res.json());
        const text = body.choices?.[0]?.message?.content;
        if (typeof text !== 'string')
            throw new AiUnavailableError('AI server sent an empty response');
        return { text, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0 };
    }
}
/** No model: the service answers with each task's labelled preview instead of calling this. */
export class PreviewProvider {
    constructor() {
        this.name = 'preview';
        this.model = 'preview';
        this.preview = true;
    }
    complete() {
        throw new Error('PreviewProvider is never called; AiService uses previewOutput()');
    }
}
/** Parses a model reply that should be one JSON object, tolerating markdown fences. */
export function parseJsonReply(text) {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start)
        throw new SyntaxError('No JSON object in the reply');
    return JSON.parse(trimmed.slice(start, end + 1));
}
//# sourceMappingURL=providers.js.map