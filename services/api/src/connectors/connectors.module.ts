import { Module } from '@nestjs/common';
import { ConnectorAdapters, ConnectorHttp, FetchHttp } from './adapters.js';
import { ConnectorsController } from './connectors.controller.js';
import { ConnectorIntegrationsController } from './integrations.controller.js';
import { ConnectorsService } from './connectors.service.js';

/** Connector registry, outbound webhooks and the Koha, Zoom/Teams and BI adapters (PRD section 67). */
@Module({
  controllers: [ConnectorsController, ConnectorIntegrationsController],
  providers: [ConnectorsService, ConnectorAdapters, { provide: ConnectorHttp, useClass: FetchHttp }],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
