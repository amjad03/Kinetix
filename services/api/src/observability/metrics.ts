/** A tiny Prometheus registry (text exposition format 0.0.4): counters, gauges and histograms with labels. */

type Labels = Record<string, string>;
const key = (l: Labels) => Object.keys(l).sort().map((k) => `${k}="${String(l[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`).join(',');

class Family {
  readonly series = new Map<string, { labels: Labels; value: number; buckets?: number[]; sum?: number }>();
  constructor(readonly name: string, readonly help: string, readonly type: 'counter' | 'gauge' | 'histogram', readonly bounds: number[] = []) {}

  private get(labels: Labels) {
    const k = key(labels);
    let s = this.series.get(k);
    if (!s) this.series.set(k, (s = { labels, value: 0, ...(this.type === 'histogram' ? { buckets: this.bounds.map(() => 0), sum: 0 } : {}) }));
    return s;
  }

  inc(labels: Labels = {}, by = 1): void {
    this.get(labels).value += by;
  }

  set(labels: Labels, v: number): void {
    this.get(labels).value = v;
  }

  observe(labels: Labels, v: number): void {
    const s = this.get(labels);
    s.value += 1;
    s.sum! += v;
    this.bounds.forEach((b, i) => {
      if (v <= b) s.buckets![i]++;
    });
  }
}

export class MetricsRegistry {
  private readonly families = new Map<string, Family>();

  private family(name: string, help: string, type: Family['type'], bounds?: number[]): Family {
    let f = this.families.get(name);
    if (!f) this.families.set(name, (f = new Family(name, help, type, bounds)));
    return f;
  }

  counter(name: string, help: string) {
    return this.family(name, help, 'counter');
  }

  gauge(name: string, help: string) {
    return this.family(name, help, 'gauge');
  }

  histogram(name: string, help: string, bounds = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    return this.family(name, help, 'histogram', bounds);
  }

  render(): string {
    const out: string[] = [];
    for (const f of this.families.values()) {
      out.push(`# HELP ${f.name} ${f.help}`, `# TYPE ${f.name} ${f.type}`);
      for (const s of f.series.values()) {
        const l = key(s.labels);
        if (f.type === 'histogram') {
          f.bounds.forEach((b, i) => out.push(`${f.name}_bucket{${l}${l ? ',' : ''}le="${b}"} ${s.buckets![i]}`));
          out.push(`${f.name}_bucket{${l}${l ? ',' : ''}le="+Inf"} ${s.value}`, `${f.name}_sum${l ? `{${l}}` : ''} ${s.sum}`, `${f.name}_count${l ? `{${l}}` : ''} ${s.value}`);
        } else out.push(`${f.name}${l ? `{${l}}` : ''} ${s.value}`);
      }
    }
    return out.join('\n') + '\n';
  }
}

export const registry = new MetricsRegistry();
export const httpRequests = registry.counter('kinetix_http_requests_total', 'HTTP requests by method, route and status class.');
export const httpDuration = registry.histogram('kinetix_http_request_duration_seconds', 'HTTP request duration in seconds.');
export const eventsDispatched = registry.counter('kinetix_domain_events_total', 'Domain events handled, by type and outcome.');
export const reportRunsTotal = registry.counter('kinetix_report_runs_total', 'Report runs by report and outcome.');
export const uploadScansTotal = registry.counter('kinetix_upload_scans_total', 'Upload virus scans by outcome.');
export const processUptime = registry.gauge('kinetix_process_uptime_seconds', 'Seconds since the process started.');
export const processMemory = registry.gauge('kinetix_process_resident_memory_bytes', 'Resident memory of the process.');

/** Refreshes the process gauges, then renders everything. */
export function renderMetrics(): string {
  processUptime.set({}, Math.round(process.uptime()));
  processMemory.set({}, process.memoryUsage().rss);
  return registry.render();
}
