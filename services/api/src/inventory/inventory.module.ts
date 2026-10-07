import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';
import { InventoryController } from './inventory.controller.js';

@Module({ controllers: [InventoryController, AssetsController] })
export class InventoryModule {}
