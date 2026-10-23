import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../platform/platform-admin.guard.js';
import { DevicesController } from './devices.controller.js';
import { FleetController } from './fleet.controller.js';
import { FleetGateway } from './fleet.gateway.js';
import { FleetService } from './fleet.service.js';
import { PanelController, PanelDeviceController, PlatformPanelController } from './panel.controller.js';
import { PanelService } from './panel.service.js';

@Module({
  controllers: [DevicesController, FleetController, PanelController, PanelDeviceController, PlatformPanelController],
  providers: [FleetService, FleetGateway, PanelService, PlatformAdminGuard],
  exports: [FleetService, PanelService],
})
export class DevicesModule {}
