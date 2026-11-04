import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../platform/platform-admin.guard.js';
import { MobilePlatformController, MobilePublicController, NotificationPrefsController } from './mobile.controller.js';

/** What the four apps need from the API beyond their modules: version gate, crash reports, personal notification settings. */
@Module({
  controllers: [MobilePublicController, MobilePlatformController, NotificationPrefsController],
  providers: [PlatformAdminGuard],
})
export class MobileModule {}
