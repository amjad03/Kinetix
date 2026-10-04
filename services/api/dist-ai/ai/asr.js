import { AiUnavailableError } from './providers.js';
/** Speech to text. Every implementation must run in India. */
export class SpeechToText {
}
/** An OpenAI-compatible /audio/transcriptions server: faster-whisper-server, vLLM, others. */
export class OpenAiCompatibleAsr extends SpeechToText {
    constructor(baseUrl, model, apiKey) {
        super();
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.configured = true;
    }
    async transcribe(audio, mime, language) {
        const form = new FormData();
        const ext = mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('webm') ? 'webm' : 'wav';
        form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `lesson.${ext}`);
        form.append('model', this.model);
        form.append('language', language);
        form.append('response_format', 'json');
        let res;
        try {
            res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
                method: 'POST',
                headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
                body: form,
                signal: AbortSignal.timeout(30 * 60_000),
            });
        }
        catch (e) {
            throw new AiUnavailableError(`Speech server unreachable: ${e.message}`);
        }
        if (!res.ok)
            throw new AiUnavailableError(`Speech server returned ${res.status}`);
        const body = (await res.json());
        if (typeof body.text !== 'string')
            throw new Error('Speech server sent no text');
        return body.text.trim();
    }
}
/** No speech server: recordings play without a transcript. */
export class NoSpeechToText extends SpeechToText {
    constructor() {
        super(...arguments);
        this.configured = false;
    }
    transcribe() {
        throw new Error('No speech-to-text server is configured');
    }
}
//# sourceMappingURL=asr.js.map