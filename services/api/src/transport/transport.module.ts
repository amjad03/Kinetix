import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TransportOpsController } from './transport-ops.controller.js';
import { TransportPassController } from './transport-pass.controller.js';
import { TransportPassRecords } from './transport-pass.records.js';
import { TransportPassService } from './transport-pass.service.js';
import { TransportController } from './transport.controller.js';
import { TransportRecords } from './transport.records.js';

@Module({
  imports: [NotificationsModule, FeesModule],
  controllers: [TransportController, TransportOpsController, TransportPassController],
  providers: [TransportRecords, TransportPassRecords, TransportPassService],
  exports: [TransportPassService],
})
export class TransportModule {}
