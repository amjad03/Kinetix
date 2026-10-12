import { Module } from '@nestjs/common';
import { HrModule } from '../hr/hr.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { FeeAccountsReadsController } from './fee-accounts-reads.controller.js';
import { FeeAccountsController } from './fee-accounts.controller.js';

/** The fees and accounts desk: approval workflows, cheques, cash closing, month close, settings, records and reports. */
@Module({ imports: [NotificationsModule, HrModule], controllers: [FeeAccountsController, FeeAccountsReadsController] })
export class FeeAccountsModule {}
