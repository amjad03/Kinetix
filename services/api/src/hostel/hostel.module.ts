import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CanteenController } from './canteen.controller.js';
import { HostelController } from './hostel.controller.js';

@Module({ imports: [NotificationsModule, FeesModule], controllers: [HostelController, CanteenController] })
export class HostelModule {}
