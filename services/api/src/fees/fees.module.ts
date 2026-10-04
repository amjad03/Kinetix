import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { FeesController } from './fees.controller.js';
import { FeesService } from './fees.service.js';
import { DemoPaymentProvider, NoPaymentProvider, PaymentProvider, RazorpayProvider } from './payment-provider.js';

@Module({
  imports: [NotificationsModule],
  providers: [
    FeesService,
    {
      provide: PaymentProvider,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.PAYMENTS_PROVIDER === 'razorpay'
          ? new RazorpayProvider(env.RAZORPAY_KEY_ID!, env.RAZORPAY_KEY_SECRET!, env.RAZORPAY_WEBHOOK_SECRET!)
          : env.PAYMENTS_PROVIDER === 'demo'
            ? new DemoPaymentProvider()
            : new NoPaymentProvider(),
    },
  ],
  controllers: [FeesController],
})
export class FeesModule {}
