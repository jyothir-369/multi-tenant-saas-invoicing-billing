import { Module, forwardRef } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { QueueService } from './queues';
import { OutboxProcessorService, EmailHandlerService } from './handlers';
import { BackgroundWorkersService } from './workers';
import {
  SmtpEmailProvider,
  MockEmailProvider,
  PdfGeneratorService,
} from './adapters';
import { InvoicesModule } from '../billing/invoices.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    forwardRef(() => InvoicesModule),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    QueueService,
    OutboxProcessorService,
    EmailHandlerService,
    BackgroundWorkersService,
    {
      provide: SmtpEmailProvider,
      useFactory: (): SmtpEmailProvider | MockEmailProvider => {
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
          return new SmtpEmailProvider();
        }
        return new MockEmailProvider();
      },
    },
    PdfGeneratorService,
  ],
  exports: [
    NotificationsService,
    QueueService,
    OutboxProcessorService,
    EmailHandlerService,
    SmtpEmailProvider,
    PdfGeneratorService,
  ],
})
export class NotificationsModule {}
