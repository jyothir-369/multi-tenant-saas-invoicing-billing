import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';
import { StripePaymentProvider } from './adapters';
import { WebhookRateLimitGuard } from './guards';
import { InvoicesModule } from '../billing/invoices.module';

@Module({
  imports: [forwardRef(() => InvoicesModule)],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, StripePaymentProvider, WebhookRateLimitGuard],
  exports: [PaymentsService, StripePaymentProvider],
})
export class PaymentsModule {}
