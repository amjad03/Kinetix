import { Module } from '@nestjs/common';
import { CastController } from './cast.controller.js';
import { CastGateway } from './cast.gateway.js';
import { CastService } from './cast.service.js';

/** Screen sharing to the board (WebRTC, signalled over the realtime namespace). */
@Module({ controllers: [CastController], providers: [CastService, CastGateway] })
export class CastModule {}
