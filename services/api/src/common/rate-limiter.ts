import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Fixed-window in-memory limiter. Good enough for a single API instance.
 * TODO: move to Redis when the API runs on more than one instance.
 */
@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, { resetAt: number; count: number }>();

  hit(key: string, limit: number, windowMs: number, now = Date.now()): void {
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { resetAt: now + windowMs, count: 1 });
      return;
    }
    w.count++;
    if (w.count > limit) {
      throw new HttpException('Too many attempts. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
