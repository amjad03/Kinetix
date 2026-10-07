import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TransportController } from './transport.controller.js';

@Module({ imports: [NotificationsModule, FeesModule], controllers: [TransportController] })
export class TransportModule {}
