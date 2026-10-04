import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller.js';

@Module({ controllers: [DevicesController], exports: [] })
export class DevicesModule {}
