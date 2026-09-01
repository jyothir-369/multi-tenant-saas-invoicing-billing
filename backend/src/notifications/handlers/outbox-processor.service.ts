import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { PdfGeneratorService } from '../adapters';
import { QueueService, JOB_NAMES } from '../queues';
import { OutboxEventType } from '../dto';

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  
  // Track processed event IDs for idempotency
  private readonly processedEvents = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Process unprocessed outbox events.
   * This is called by the worker to process events from the database.
   */
  async processUnprocessedEvents(limit: number = 100, tenantId?: string): Promise<number> {
    const events = await this.prisma.outboxEvent.findMany({
      where: { processedAt: null, ...(tenantId ? { tenantId } : {}) },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    this.logger.log(`Found ${events.length} unprocessed events`);

    let processed = 0;
    for (const event of events) {
      const success = await this.processEvent(event.id, event.type, event.payload as Record<string, any>, event.tenantId);
      if (success) {
        processed++;
      }
    }

    return processed;
  }

  /**
   * Process a single outbox event.
   * Implements idempotency by checking if event was already processed.
   */
  async processEvent(
    eventId: string,
    eventType: string,
    payload: Record<string, any>,
    tenantId: string,
  ): Promise<boolean> {
    // Idempotency check
    if (this.processedEvents.has(eventId)) {
      this.logger.log(`Event ${eventId} already processed, skipping`);
      return true;
    }

    this.logger.log(`Processing event ${eventId} of type ${eventType} for tenant ${tenantId}`);

    try {
      // Run in tenant context for proper isolation
      await this.tenantContext.run(tenantId, async () => {
        await this.handleEventByType(eventType, { ...payload, tenantId }, eventId);
        
        // Mark event as processed
        await this.prisma.outboxEvent.update({
          where: { id: eventId },
          data: { processedAt: new Date() },
        });

        // Add to processed set for idempotency
        this.processedEvents.add(eventId);
        
        this.logger.log(`Successfully processed event ${eventId}`);
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: { failedAt: new Date(), failureReason: errorMessage, attempts: { increment: 1 } },
      }).catch((updateError) => this.logger.error(`Could not record outbox failure: ${updateError}`));
      this.logger.error(`Failed to process event ${eventId}: ${errorMessage}`, error);
      return false;
    }
  }

  /**
   * Route event to appropriate handler based on type.
   */
  private async handleEventByType(
    eventType: string,
    payload: Record<string, any>,
    eventId: string,
  ): Promise<void> {
    switch (eventType) {
      case OutboxEventType.INVOICE_SENT:
        await this.handleInvoiceSent(payload);
        break;

      case OutboxEventType.INVOICE_PAID:
        await this.handleInvoicePaid(payload);
        break;

      case OutboxEventType.PAYMENT_RECEIVED:
        await this.handlePaymentReceived(payload);
        break;

      case OutboxEventType.SEND_INVOICE_EMAIL:
        await this.handleSendInvoiceEmail(payload);
        break;

      case OutboxEventType.SEND_RECEIPT_EMAIL:
        await this.handleSendReceiptEmail(payload);
        break;

      case OutboxEventType.GENERATE_INVOICE_PDF:
        await this.handleGenerateInvoicePdf(payload);
        break;

      case OutboxEventType.SEND_OVERDUE_REMINDER:
        await this.handleSendOverdueReminder(payload);
        break;

      default:
        this.logger.warn(`Unknown event type: ${eventType}`);
    }
  }

  /**
   * Handle invoice sent event - queue email and PDF generation.
   */
  private async handleInvoiceSent(payload: Record<string, any>): Promise<void> {
    this.logger.log(`Handling INVOICE_SENT for invoice ${payload.invoiceId}`);

    // Queue PDF generation
    await this.queueService.addPdfJob(JOB_NAMES.GENERATE_INVOICE_PDF, {
      tenantId: payload.tenantId || payload.customerId,
      eventId: payload.invoiceId,
      payload: {
        invoiceId: payload.invoiceId,
        ...payload,
      },
    });

    // Queue invoice email
    await this.queueService.addEmailJob(JOB_NAMES.SEND_INVOICE_EMAIL, {
      tenantId: payload.tenantId || payload.customerId,
      eventId: payload.invoiceId,
      payload,
    });
  }

  /**
   * Handle invoice paid event - queue receipt email.
   */
  private async handleInvoicePaid(payload: Record<string, any>): Promise<void> {
    this.logger.log(`Handling INVOICE_PAID for invoice ${payload.invoiceId}`);
    // Payment received handler will send the receipt
  }

  /**
   * Handle payment received event - send receipt email.
   */
  private async handlePaymentReceived(payload: Record<string, any>): Promise<void> {
    this.logger.log(`Handling PAYMENT_RECEIVED for payment ${payload.paymentId}`);

    await this.queueService.addEmailJob(JOB_NAMES.SEND_RECEIPT_EMAIL, {
      tenantId: payload.tenantId,
      eventId: payload.paymentId,
      payload,
    });
  }

  /**
   * Handle send invoice email.
   */
  private async handleSendInvoiceEmail(payload: Record<string, any>): Promise<void> {
    this.logger.log(`Handling SEND_INVOICE_EMAIL for invoice ${payload.invoiceId}`);
    // Email sending is handled by the email worker
  }

  /**
   * Handle send receipt email.
   */
  private async handleSendReceiptEmail(payload: Record<string, any>): Promise<void> {
    this.logger.log(`Handling SEND_RECEIPT_EMAIL for payment ${payload.paymentId}`);
    // Email sending is handled by the email worker
  }

  /**
   * Handle generate invoice PDF.
   */
  private async handleGenerateInvoicePdf(payload: Record<string, any>): Promise<void> {
    this.logger.log(`Handling GENERATE_INVOICE_PDF for invoice ${payload.invoiceId}`);
    // PDF generation is handled by the PDF worker
  }

  /**
   * Handle overdue reminder.
   */
  private async handleSendOverdueReminder(payload: Record<string, any>): Promise<void> {
    this.logger.log(`Handling SEND_OVERDUE_REMINDER for invoice ${payload.invoiceId}`);
    // Email sending is handled by the email worker
  }

  /**
   * Clear processed events cache (for testing).
   */
  clearProcessedEvents(): void {
    this.processedEvents.clear();
  }

  /**
   * Check if event was processed.
   */
  isEventProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }
}
