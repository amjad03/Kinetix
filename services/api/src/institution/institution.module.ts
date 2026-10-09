import { Module } from '@nestjs/common';
import { InstitutionController } from './institution.controller.js';

/** Institution profile, capability profile and buildings. */
@Module({ controllers: [InstitutionController] })
export class InstitutionModule {}
