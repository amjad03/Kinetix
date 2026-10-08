import { Module } from '@nestjs/common';
import { ConnectorsController } from './connectors.controller.js';
import { ConnectorsService } from './connectors.service.js';

/** Connector registry and outbound webhooks (PRD section 67). */
@Module({ controllers: [ConnectorsController], providers: [ConnectorsService], exports: [ConnectorsService] })
export class ConnectorsModule {}
