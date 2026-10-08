import { randomBytes } from 'node:crypto';

/**
 * Minimal OpenTelemetry tracing: W3C `traceparent` propagation and an OTLP/HTTP JSON exporter
 * (`POST <OTEL_EXPORTER_OTLP_ENDPOINT>/v1/traces`), batched and fire-and-forget. One server span
 * per HTTP request; the trace id is also on every log line. Without an endpoint nothing is sent.
 */

export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startMs: number;
  endMs: number;
  attributes: Record<string, string | number | boolean>;
  error: boolean;
}

export const newTraceId = () => randomBytes(16).toString('hex');
export const newSpanId = () => randomBytes(8).toString('hex');

/** `00-<32 hex trace>-<16 hex span>-<flags>`; null when absent or malformed. */
export function parseTraceparent(h: string | undefined): { traceId: string; parentSpanId: string; sampled: boolean } | null {
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(h ?? '');
  if (!m || /^0+$/.test(m[1]) || /^0+$/.test(m[2])) return null;
  return { traceId: m[1], parentSpanId: m[2], sampled: (parseInt(m[3], 16) & 1) === 1 };
}

const nanos = (ms: number) => String(BigInt(Math.round(ms * 1000)) * 1000n);
const attr = (k: string, v: string | number | boolean) => ({ key: k, value: typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { boolValue: v } : Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v } });

/** The OTLP/HTTP JSON body for a batch of spans (exported for tests). */
export function otlpBody(service: string, spans: SpanData[]) {
  return {
    resourceSpans: [
      {
        resource: { attributes: [attr('service.name', service)] },
        scopeSpans: [
          {
            scope: { name: 'kinetix-api' },
            spans: spans.map((s) => ({
              traceId: s.traceId,
              spanId: s.spanId,
              ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
              name: s.name,
              kind: 2,
              startTimeUnixNano: nanos(s.startMs),
              endTimeUnixNano: nanos(s.endMs),
              attributes: Object.entries(s.attributes).map(([k, v]) => attr(k, v)),
              status: { code: s.error ? 2 : 1 },
            })),
          },
        ],
      },
    ],
  };
}

export class Tracer {
  private queue: SpanData[] = [];
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly endpoint: string | undefined,
    private readonly service: string,
    private readonly sampleRate: number,
    private readonly send: (url: string, body: string) => Promise<unknown> = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(5000) }),
  ) {}

  get enabled(): boolean {
    return !!this.endpoint;
  }

  /** Head sampling: honours the caller's decision when it sent a traceparent. */
  shouldSample(parentSampled?: boolean): boolean {
    return this.enabled && (parentSampled ?? Math.random() < this.sampleRate);
  }

  record(span: SpanData): void {
    if (!this.enabled) return;
    this.queue.push(span);
    if (this.queue.length >= 100) void this.flush();
    else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), 2000);
      this.timer.unref();
    }
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const batch = this.queue.splice(0);
    if (!batch.length || !this.endpoint) return;
    try {
      await this.send(`${this.endpoint.replace(/\/$/, '')}/v1/traces`, JSON.stringify(otlpBody(this.service, batch)));
    } catch {
      // Telemetry must never break the request path; the batch is dropped.
    }
  }
}
