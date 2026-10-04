import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimiter } from '../common/rate-limiter.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { TokensService } from './tokens.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [TokensService, RateLimiter, AuthGuard, { provide: APP_GUARD, useExisting: AuthGuard }],
  exports: [TokensService, RateLimiter, AuthGuard],
})
export class AuthModule {}
