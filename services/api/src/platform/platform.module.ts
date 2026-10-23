import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ContentLicensesController } from './content-licenses.controller.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PlatformController } from './platform.controller.js';
import { PlatformTenantsController } from './tenants.controller.js';
import { YouTube } from './youtube.js';

/** The Zynetix platform team's endpoints (concept videos on the global library). */
@Module({
  controllers: [PlatformController, ContentLicensesController, PlatformTenantsController],
  exports: [YouTube],
  providers: [PlatformAdminGuard, { provide: YouTube, inject: [ENV], useFactory: (env: Env) => new YouTube(env.YOUTUBE_API_KEY, fetch, 8000, env.YOUTUBE_BASE_URL) }],
})
export class PlatformModule {}
