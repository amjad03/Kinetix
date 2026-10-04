import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { PushController } from './push.controller.js';
import { FcmPushSender, NoPushSender, PushSender } from './push-sender.js';
import { PushService } from './push.service.js';

@Global()
@Module({
  providers: [
    PushService,
    { provide: PushSender, inject: [ENV], useFactory: (env: Env) => (env.FCM_SERVICE_ACCOUNT ? new FcmPushSender(env.FCM_SERVICE_ACCOUNT) : new NoPushSender()) },
  ],
  controllers: [PushController],
  exports: [PushService],
})
export class PushModule {}
