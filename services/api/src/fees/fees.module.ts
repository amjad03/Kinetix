import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ApplicationFeesService } from './application-fees.service.js';
import { BankTransfersController } from './bank-transfers.controller.js';
import { SponsorBillingController } from './sponsor-billing.controller.js';
import { FeesController } from './fees.controller.js';
import { FeesDepthController } from './fees-depth.controller.js';
import { FeesService } from './fees.service.js';
import { PaymentGateway } from './payment-gateway.service.js';
import { FakePayuApi, FakeRazorpayApi, HttpPayuApi, HttpRazorpayApi, PayuApi, RazorpayApi } from './payment-provider.js';
import { SettlementsController } from './settlements.controller.js';
import { PaymentsGatewayController } from './payments-gateway.controller.js';
import { WalletTopupService } from './wallet-topup.service.js';
import { PaymentsAdminController } from './payments-admin.controller.js';

@Module({
  imports: [NotificationsModule],
  providers: [
    FeesService,
    ApplicationFeesService,
    WalletTopupService,
    PaymentGateway,
    // Each institution's own keys are used per request (PaymentGateway); RAZORPAY_FAKE keeps tests off the network.
    { provide: RazorpayApi, inject: [ENV], useFactory: (env: Env) => (env.RAZORPAY_FAKE ? new FakeRazorpayApi() : new HttpRazorpayApi()) },
    { provide: PayuApi, inject: [ENV], useFactory: (env: Env) => (env.PAYU_FAKE ? new FakePayuApi() : new HttpPayuApi(env.PAYU_MODE)) },
  ],
  controllers: [FeesController, FeesDepthController, PaymentsAdminController, PaymentsGatewayController, SettlementsController, BankTransfersController, SponsorBillingController],
  exports: [FeesService, PaymentGateway, ApplicationFeesService, WalletTopupService],
})
export class FeesModule {}
