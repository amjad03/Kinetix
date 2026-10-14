import { Module } from '@nestjs/common';
import { DelegationController } from './delegation.controller.js';
import { DelegationService } from './delegation.service.js';
import { DelegationRecords } from './delegations.records.js';

/** Delegated approvals: a staff member lets a colleague decide their workflow and leave approvals for a while. */
@Module({ controllers: [DelegationController], providers: [DelegationService, DelegationRecords], exports: [DelegationService] })
export class DelegationModule {}
