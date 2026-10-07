import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PlatformController } from './platform.controller.js';
import { YouTube } from './youtube.js';

/** The KINETIX platform team's endpoints (concept videos on the global library). */
@Module({
  controllers: [PlatformController],
  exports: [YouTube],
  providers: [PlatformAdminGuard, { provide: YouTube, inject: [ENV], useFactory: (env: Env) => new YouTube(env.YOUTUBE_API_KEY) }],
})
export class PlatformModule {}
