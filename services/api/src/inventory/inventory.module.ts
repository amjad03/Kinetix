import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';
import { AssetsDepthController } from './assets-depth.controller.js';
import { AssetsService } from './assets.service.js';
import { FacilitiesController } from './facilities.controller.js';
import { FacilitiesRecords } from './facilities.records.js';
import { FacilitiesService } from './facilities.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryRecords } from './inventory.records.js';
import { ProcurementDepthController } from './procurement-depth.controller.js';
import { ProcurementService } from './procurement.service.js';
import { StockAlerts, StoresPassController } from './stores-pass.controller.js';
import { AssetReportsController, StoresReportsController } from './stores-reports.controller.js';

/** Stores, procurement, the asset register and facilities (rooms, bookings, maintenance tickets). */
@Module({
  controllers: [InventoryController, ProcurementDepthController, StoresPassController, StoresReportsController, AssetReportsController, AssetsController, AssetsDepthController, FacilitiesController],
  providers: [ProcurementService, AssetsService, FacilitiesService, InventoryRecords, FacilitiesRecords, StockAlerts],
})
export class InventoryModule {}
