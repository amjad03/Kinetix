import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { HrModule } from '../hr/hr.module.js';
import { CertificatesController } from './certificates.controller.js';
import { CertificatesService } from './certificates.service.js';
import { IdCardsController } from './id-cards.controller.js';
import { PublicVerifyController } from './public-verify.controller.js';
import { VaultController } from './vault.controller.js';

/** Certificates, ID cards, fee-receipt PDFs and the document vault (docs/architecture/documents-certificates.md). */
@Module({
  imports: [FeesModule, HrModule],
  controllers: [CertificatesController, IdCardsController, VaultController, PublicVerifyController],
  providers: [CertificatesService],
})
export class DocumentsModule {}
