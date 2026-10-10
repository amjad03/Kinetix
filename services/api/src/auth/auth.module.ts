import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { MemoryRateLimiter, RateLimiter, RedisRateLimiter } from '../common/rate-limiter.js';
import { ENV, type Env } from '../config/env.js';
import { REDIS } from '../redis/redis.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { MfaController, SecurityPolicyController } from './mfa.controller.js';
import { MfaService } from './mfa.service.js';
import { OtpService } from './otp.service.js';
import { MePasswordController, PasswordResetController } from './password.controller.js';
import { ConsoleSmsSender, Msg91SmsSender, SmsSender } from './sms-sender.js';
import { TokensService } from './tokens.service.js';

@Global()
@Module({
  controllers: [AuthController, MePasswordController, PasswordResetController, MfaController, SecurityPolicyController],
  providers: [
    TokensService,
    MfaService,
    OtpService,
    { provide: RateLimiter, inject: [REDIS], useFactory: (redis: Redis | null) => (redis ? new RedisRateLimiter(redis) : new MemoryRateLimiter()) },
    {
      provide: SmsSender,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.SMS_PROVIDER === 'msg91' ? new Msg91SmsSender({ authKey: env.MSG91_AUTH_KEY!, templateId: env.MSG91_TEMPLATE_ID!, senderId: env.MSG91_SENDER_ID! }) : new ConsoleSmsSender(),
    },
    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
  exports: [TokensService, MfaService, OtpService, RateLimiter, AuthGuard],
})
export class AuthModule {}
