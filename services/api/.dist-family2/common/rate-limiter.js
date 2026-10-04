var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
/**
 * Fixed-window in-memory limiter. Good enough for a single API instance.
 * TODO: move to Redis when the API runs on more than one instance.
 */
let RateLimiter = class RateLimiter {
    constructor() {
        this.windows = new Map();
    }
    hit(key, limit, windowMs, now = Date.now()) {
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
};
RateLimiter = __decorate([
    Injectable()
], RateLimiter);
export { RateLimiter };
//# sourceMappingURL=rate-limiter.js.map