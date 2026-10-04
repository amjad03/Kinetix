import { Controller, Get, Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AiModule } from './ai/ai.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { FeesModule } from './fees/fees.module.js';
import { PushModule } from './push/push.module.js';
import { RecordingsModule } from './recordings/recordings.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { ContentModule } from './content/content.module.js';
import { DbModule } from './db/db.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PairingModule } from './pairing/pairing.module.js';
import { ParentModule } from './parent/parent.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { SyncModule } from './sync/sync.module.js';
import { TeacherModule } from './teacher/teacher.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { WhiteboardsModule } from './whiteboards/whiteboards.module.js';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    DbModule,
    StorageModule,
    JobsModule,
    PushModule,
    AuthModule,
    RealtimeModule,
    TimetableModule,
    SessionsModule,
    DevicesModule,
    PairingModule,
    BroadcastsModule,
    SyncModule,
    NotificationsModule,
    WhiteboardsModule,
    ParentModule,
    AdminModule,
    TeacherModule,
    ContentModule,
    AiModule,
    RecordingsModule,
    FeesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
