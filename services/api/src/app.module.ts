import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AiModule } from './ai/ai.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { FeesModule } from './fees/fees.module.js';
import { HostelModule } from './hostel/hostel.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { TransportModule } from './transport/transport.module.js';
import { LibraryModule } from './library/library.module.js';
import { ExamsModule } from './exams/exams.module.js';
import { ObeModule } from './obe/obe.module.js';
import { MarksModule } from './marks/marks.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { PushModule } from './push/push.module.js';
import { RecordingsModule } from './recordings/recordings.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AdmissionsModule } from './admissions/admissions.module.js';
import { StudentsModule } from './students/students.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BoardProfilesModule } from './board-profiles/board-profiles.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { ContentModule } from './content/content.module.js';
import { DbModule } from './db/db.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ImportModule } from './import/import.module.js';
import { HealthModule } from './health/health.controller.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { CodeModule } from './code/code.module.js';
import { ConsentModule } from './consent/consent.module.js';
import { PlansModule } from './plans/plans.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { CoverageModule } from './coverage/coverage.module.js';
import { HrModule } from './hr/hr.module.js';
import { LmsModule } from './lms/lms.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { PlacementsModule } from './placements/placements.module.js';
import { ResearchModule } from './research/research.module.js';
import { WelfareModule } from './welfare/welfare.module.js';
import { CampusLifeModule } from './campus-life/campus-life.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HomeworkModule } from './homework/homework.module.js';
import { DepartmentsModule } from './departments/departments.module.js';
import { CastModule } from './cast/cast.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PairingModule } from './pairing/pairing.module.js';
import { PollsModule } from './polls/polls.module.js';
import { BadgesModule } from './badges/badges.module.js';
import { ParentModule } from './parent/parent.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RemoteModule } from './remote/remote.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { SyncModule } from './sync/sync.module.js';
import { TeacherModule } from './teacher/teacher.module.js';
import { TermsModule } from './terms/terms.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { WhiteboardsModule } from './whiteboards/whiteboards.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { EventsModule } from './events/events.js';
import { FlagsModule } from './flags/flags.js';
import { ObservabilityModule } from './observability/observability.js';
import { ScanningModule } from './scanning/upload-scan.js';
import { SearchModule } from './search/search.controller.js';

@Module({
  imports: [
    DbModule,
    RedisModule,
    ObservabilityModule,
    EventsModule,
    FlagsModule,
    ScanningModule,
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
    PollsModule,
    BadgesModule,
    RemoteModule,
    CastModule,
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
    AdmissionsModule,
    StudentsModule,
    LibraryModule,
    TransportModule,
    HostelModule,
    InventoryModule,
    MarksModule,
    ExamsModule,
    ObeModule,
    MessagesModule,
    CodeModule,
    HrModule,
    LmsModule,
    FinanceModule,
    PlacementsModule,
    ResearchModule,
    WelfareModule,
    CampusLifeModule,
    DocumentsModule,
    PlatformModule,
    AnalyticsModule,
    SearchModule,
  ],
})
export class AppModule {}
