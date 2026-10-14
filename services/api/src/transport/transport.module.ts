import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TransportOpsController } from './transport-ops.controller.js';
import { TransportController } from './transport.controller.js';
import { TransportRecords } from './transport.records.js';

@Module({ imports: [NotificationsModule, FeesModule], controllers: [TransportController, TransportOpsController], providers: [TransportRecords] })
export class TransportModule {}
