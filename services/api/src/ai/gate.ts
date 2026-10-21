/**
 * How many AI requests this API instance sends to the model at once (AI_MAX_CONCURRENT). A
 * request over the limit waits up to AI_QUEUE_WAIT_MS for a free slot; if none frees up it is
 * refused and logged as `throttled`, so a peak period shows in the AI usage dashboard instead of
 * the model server failing silently under load.
 */
export class AiGate {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(
    readonly max: number,
    readonly waitMs: number,
  ) {}

  /** A release function once a slot is free, or null when none freed up in time. */
  acquire(): Promise<(() => void) | null> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve(this.releaser());
    }
    if (this.waitMs <= 0) return Promise.resolve(null);
    return new Promise((resolve) => {
      const entry = () => {
        clearTimeout(timer);
        this.running++;
        resolve(this.releaser());
      };
      const timer = setTimeout(() => {
        this.queue = this.queue.filter((e) => e !== entry);
        resolve(null);
      }, this.waitMs);
      this.queue.push(entry);
    });
  }

  /** Requests running and waiting now, for the dashboard. */
  get load() {
    return { running: this.running, waiting: this.queue.length, max: this.max };
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.running--;
      this.queue.shift()?.();
    };
  }
}
