import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';
import { AssetsDepthController } from './assets-depth.controller.js';
import { InventoryController } from './inventory.controller.js';

@Module({ controllers: [InventoryController, AssetsController, AssetsDepthController] })
export class InventoryModule {}
