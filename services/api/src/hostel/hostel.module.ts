import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CanteenController } from './canteen.controller.js';
import { CanteenOpsController, HostelWorkOrdersController } from './campus-ops.controller.js';
import { HostelOpsController } from './hostel-ops.controller.js';
import { HostelController } from './hostel.controller.js';
import { HostelRecords } from './hostel.records.js';

@Module({ imports: [NotificationsModule, FeesModule], controllers: [HostelController, CanteenController, HostelWorkOrdersController, CanteenOpsController, HostelOpsController], providers: [HostelRecords] })
export class HostelModule {}
