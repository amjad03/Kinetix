import { Module } from '@nestjs/common';
import { FeeDepthModule } from '../fee-depth/fee-depth.module.js';
import { FeesModule } from '../fees/fees.module.js';
import { FeeAccountRecords } from './fee-accounts.records.js';
import { FeeFlagshipController } from './flagship.controller.js';

/**
 * Fees flagship: fee accounts (the trust, the college, the hostel) as records, duplicate payments, programme
 * transfers and readmissions, government scholarship verification and portal status files, UPI QR, fee references,
 * accrual re-booking and the Zoho Books export. Gateways, payment links and the accrual postings live in FeesModule.
 */
@Module({
  imports: [FeesModule, FeeDepthModule],
  providers: [FeeAccountRecords],
  controllers: [FeeFlagshipController],
})
export class FeeFlagshipModule {}
