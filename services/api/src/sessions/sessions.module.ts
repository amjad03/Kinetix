import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SessionsController, StudentLiveController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Global()
@Module({ imports: [NotificationsModule], controllers: [SessionsController, StudentLiveController], providers: [SessionsService], exports: [SessionsService] })
export class SessionsModule {}
