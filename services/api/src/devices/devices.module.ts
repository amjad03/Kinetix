import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller.js';
import { FleetController } from './fleet.controller.js';
import { FleetGateway } from './fleet.gateway.js';
import { FleetService } from './fleet.service.js';

@Module({ controllers: [DevicesController, FleetController], providers: [FleetService, FleetGateway], exports: [FleetService] })
export class DevicesModule {}
