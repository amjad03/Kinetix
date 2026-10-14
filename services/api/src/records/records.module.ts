import { Global, Module } from '@nestjs/common';
import { RecordRegistry } from './entity.js';
import { RecordsController } from './records.controller.js';
import { RecordsService } from './records.service.js';
import { RecycleBinController } from './recycle-bin.controller.js';
import { RecycleBinService } from './recycle-bin.service.js';
import { SavedViewsController } from './saved-views.controller.js';

/**
 * The record depth kit (docs/requirements/RECORD_DEPTH_KIT.md). Global so any module can inject the
 * {@link RecordRegistry} and register its entities.
 */
@Global()
@Module({
  controllers: [RecordsController, RecycleBinController, SavedViewsController],
  providers: [RecordRegistry, RecordsService, RecycleBinService],
  exports: [RecordRegistry, RecordsService, RecycleBinService],
})
export class RecordsModule {}
