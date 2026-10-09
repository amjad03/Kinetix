import { Module } from '@nestjs/common';
import { DpdpController } from './dpdp.controller.js';
import { DpdpService } from './dpdp.service.js';

/** DPDP Act data-principal rights: export my data, correction, erasure with retention rules, grievance officer. */
@Module({ controllers: [DpdpController], providers: [DpdpService], exports: [DpdpService] })
export class DpdpModule {}
