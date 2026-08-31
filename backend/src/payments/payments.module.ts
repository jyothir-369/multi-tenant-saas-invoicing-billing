import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider, StripePaymentProvider } from './adapters';
import { WebhookRateLimitGuard } from './guards';
import { InvoicesModule } from '../billing/invoices.module';

@Module({
  imports: [forwardRef(() => InvoicesModule)],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    MockPaymentProvider,
    {
      provide: StripePaymentProvider,
      useFactory: (mock: MockPaymentProvider) => process.env.STRIPE_SECRET_KEY ? new StripePaymentProvider() : mock,
      inject: [MockPaymentProvider],
    },
    WebhookRateLimitGuard,
  ],
  exports: [PaymentsService, StripePaymentProvider],
})
export class PaymentsModule {}
