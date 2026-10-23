import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module.js';
import { CloudHttp, FetchCloudHttp } from './cloud-http.js';
import { CloudController } from './cloud.controller.js';
import { CloudService } from './cloud.service.js';

/** Google Drive, OneDrive, Google Classroom and Moodle for the board (set up in the connector registry). */
@Module({
  imports: [ConnectorsModule],
  controllers: [CloudController],
  providers: [CloudService, { provide: CloudHttp, useClass: FetchCloudHttp }],
})
export class CloudModule {}
