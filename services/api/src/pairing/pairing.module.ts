import { Module } from '@nestjs/common';
import { OfflinePairingController, SigningKeys } from './offline-pairing.controller.js';
import { PairingController } from './pairing.controller.js';
import { PairingService } from './pairing.service.js';

@Module({ controllers: [PairingController, OfflinePairingController], providers: [PairingService, SigningKeys], exports: [PairingService] })
export class PairingModule {}
