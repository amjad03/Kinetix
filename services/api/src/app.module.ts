import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AiModule } from './ai/ai.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { FeesModule } from './fees/fees.module.js';
import { LibraryModule } from './library/library.module.js';
import { MarksModule } from './marks/marks.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { PushModule } from './push/push.module.js';
import { RecordingsModule } from './recordings/recordings.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BoardProfilesModule } from './board-profiles/board-profiles.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { ContentModule } from './content/content.module.js';
import { DbModule } from './db/db.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ImportModule } from './import/import.module.js';
import { HealthModule } from './health/health.controller.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { ConsentModule } from './consent/consent.module.js';
import { PlansModule } from './plans/plans.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { CoverageModule } from './coverage/coverage.module.js';
import { HomeworkModule } from './homework/homework.module.js';
import { DepartmentsModule } from './departments/departments.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PairingModule } from './pairing/pairing.module.js';
import { ParentModule } from './parent/parent.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { SyncModule } from './sync/sync.module.js';
import { TeacherModule } from './teacher/teacher.module.js';
import { TermsModule } from './terms/terms.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { WhiteboardsModule } from './whiteboards/whiteboards.module.js';

@Module({
  imports: [
    DbModule,
    RedisModule,
    HealthModule,
    StorageModule,
    JobsModule,
    PushModule,
    AuthModule,
    RealtimeModule,
    TimetableModule,
    DepartmentsModule,
    CalendarModule,
    TermsModule,
    CoverageModule,
    HomeworkModule,
    ConsentModule,
    PlansModule,
    SessionsModule,
    DevicesModule,
    PairingModule,
    BoardProfilesModule,
    BroadcastsModule,
    SyncModule,
    NotificationsModule,
    WhiteboardsModule,
    ParentModule,
    AdminModule,
    ImportModule,
    TeacherModule,
    ContentModule,
    AiModule,
    RecordingsModule,
    FeesModule,
    LibraryModule,
    MarksModule,
    MessagesModule,
    PlatformModule,
  ],
})
export class AppModule {}
