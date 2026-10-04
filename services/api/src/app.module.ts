import { Controller, Get, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { DbModule } from './db/db.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { PairingModule } from './pairing/pairing.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { SyncModule } from './sync/sync.module.js';
import { TimetableModule } from './timetable/timetable.module.js';

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
    AuthModule,
    RealtimeModule,
    TimetableModule,
    SessionsModule,
    DevicesModule,
    PairingModule,
    BroadcastsModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
