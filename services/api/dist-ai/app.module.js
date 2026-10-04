var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
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
let HealthController = class HealthController {
    health() {
        return { status: 'ok' };
    }
};
__decorate([
    Get('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "health", null);
HealthController = __decorate([
    Controller()
], HealthController);
let AppModule = class AppModule {
};
AppModule = __decorate([
    Module({
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
], AppModule);
export { AppModule };
//# sourceMappingURL=app.module.js.map