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
import { GatewayAccountsController } from './gateway-accounts.controller.js';
import { GatewayFlow } from './gateway-flow.service.js';
import { PaymentLinksController } from './payment-links.controller.js';
import { CheckoutLaunchController } from './checkout-launch.controller.js';

@Module({
  imports: [NotificationsModule],
  providers: [
    FeesService,
    ApplicationFeesService,
    WalletTopupService,
    PaymentGateway,
    GatewayFlow,
    // Each institution's own keys are used per request (PaymentGateway); RAZORPAY_FAKE keeps tests off the network.
    { provide: RazorpayApi, inject: [ENV], useFactory: (env: Env) => (env.RAZORPAY_FAKE ? new FakeRazorpayApi() : new HttpRazorpayApi(env.PAYMENT_GATEWAY_TEST_BASE ? `${env.PAYMENT_GATEWAY_TEST_BASE.replace(/\/+$/, '')}/razorpay` : undefined)) },
    { provide: PayuApi, inject: [ENV], useFactory: (env: Env) => (env.PAYU_FAKE ? new FakePayuApi() : new HttpPayuApi(env.PAYU_MODE)) },
  ],
  controllers: [FeesController, FeesDepthController, PaymentsAdminController, PaymentsGatewayController, GatewayAccountsController, PaymentLinksController, CheckoutLaunchController, SettlementsController, BankTransfersController, SponsorBillingController],
  exports: [FeesService, PaymentGateway, GatewayFlow, ApplicationFeesService, WalletTopupService],
})
export class FeesModule {}
