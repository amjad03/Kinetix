import { Module } from '@nestjs/common';
import { ModelRequestsController } from './model-requests.controller.js';
import { ModelRequestsService } from './model-requests.service.js';

/** 3D model requests: what teachers ask for from the board's 3D library, per school. */
@Module({ controllers: [ModelRequestsController], providers: [ModelRequestsService] })
export class ModelRequestsModule {}
