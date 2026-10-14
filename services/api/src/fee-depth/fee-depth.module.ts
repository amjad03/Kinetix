import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BankController } from './bank.controller.js';
import { CollectionController } from './collection.controller.js';
import { CollectionService } from './collection.service.js';
import { DuesService } from './dues.service.js';
import { FeeRecords } from './fee.records.js';
import { AccountsRecords } from './accounts.records.js';
import { FeeSetupController } from './setup.controller.js';
import { FeeSetupService } from './setup.service.js';

/**
 * Fees and accounts depth: fee heads, structures by batch, quota and category with bulk and pro-rata assignment, the
 * multi-mode counter with head allocation, receipts that are cancelled (never deleted) and reissued, challans,
 * government scholarships, carry-forward, dues blocks, reminders, bank reconciliation, funds, and the record-kit
 * lists of the fees and accounts desk.
 */
@Module({
  imports: [FeesModule, NotificationsModule],
  providers: [FeeSetupService, CollectionService, DuesService, FeeRecords, AccountsRecords],
  controllers: [FeeSetupController, CollectionController, BankController],
  exports: [DuesService, CollectionService],
})
export class FeeDepthModule {}
