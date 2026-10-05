import { Module } from '@nestjs/common';
import { PairingModule } from '../pairing/pairing.module.js';
import { BoardProfilesController } from './board-profiles.controller.js';
import { BoardProfilesService } from './board-profiles.service.js';

@Module({ imports: [PairingModule], controllers: [BoardProfilesController], providers: [BoardProfilesService] })
export class BoardProfilesModule {}
