import { AiUnavailableError } from './providers.js';

/** Speech to text. Every implementation must run in India. */
export abstract class SpeechToText {
  abstract readonly configured: boolean;
  abstract transcribe(audio: Buffer, mime: string, language: string): Promise<string>;
}

/** An OpenAI-compatible /audio/transcriptions server: faster-whisper-server, vLLM, others. */
export class OpenAiCompatibleAsr extends SpeechToText {
  readonly configured = true;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string | undefined,
  ) {
    super();
  }

  async transcribe(audio: Buffer, mime: string, language: string): Promise<string> {
    const form = new FormData();
    const ext = mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('webm') ? 'webm' : 'wav';
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `lesson.${ext}`);
    form.append('model', this.model);
    form.append('language', language);
    form.append('response_format', 'json');
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        body: form,
        signal: AbortSignal.timeout(30 * 60_000),
      });
    } catch (e) {
      throw new AiUnavailableError(`Speech server unreachable: ${(e as Error).message}`);
    }
    if (!res.ok) throw new AiUnavailableError(`Speech server returned ${res.status}`);
    const body = (await res.json()) as { text?: string };
    if (typeof body.text !== 'string') throw new Error('Speech server sent no text');
    return body.text.trim();
  }
}

/** No speech server: recordings play without a transcript. */
export class NoSpeechToText extends SpeechToText {
  readonly configured = false;
  transcribe(): Promise<string> {
    throw new Error('No speech-to-text server is configured');
  }
}
