import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ApplicationFeesService } from './application-fees.service.js';
import { FeesController } from './fees.controller.js';
import { FeesService } from './fees.service.js';
import { PaymentGateway } from './payment-gateway.service.js';
import { FakeRazorpayApi, HttpRazorpayApi, RazorpayApi } from './payment-provider.js';
import { PaymentsAdminController } from './payments-admin.controller.js';

@Module({
  imports: [NotificationsModule],
  providers: [
    FeesService,
    ApplicationFeesService,
    PaymentGateway,
    // Each institution's own keys are used per request (PaymentGateway); RAZORPAY_FAKE keeps tests off the network.
    { provide: RazorpayApi, inject: [ENV], useFactory: (env: Env) => (env.RAZORPAY_FAKE ? new FakeRazorpayApi() : new HttpRazorpayApi()) },
  ],
  controllers: [FeesController, PaymentsAdminController],
  exports: [FeesService, PaymentGateway, ApplicationFeesService],
})
export class FeesModule {}
