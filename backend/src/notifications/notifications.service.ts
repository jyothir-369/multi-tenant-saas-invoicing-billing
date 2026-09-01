import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';
import { QueueService, JOB_NAMES } from './queues';
import { OutboxProcessorService } from './handlers';
import { EmailHandlerService } from './handlers';
import { PdfGeneratorService } from './adapters';
import { OutboxEventType } from './dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly queueService: QueueService,
    private readonly outboxProcessor: OutboxProcessorService,
    private readonly emailHandler: EmailHandlerService,
    private readonly pdfGenerator: PdfGeneratorService,
  ) {}

  private tenant() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not available');
    return tenantId;
  }

  async list(userId: string) {
    const tenantId = this.tenant();
    const events = await this.prisma.outboxEvent.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
    const reads = await this.prisma.notificationRead.findMany({ where: { tenantId, userId }, select: { eventId: true } });
    const readIds = new Set(reads.map(r => r.eventId));
    return events.map(event => ({ id: event.id, type: event.type, payload: event.payload, createdAt: event.createdAt, read: readIds.has(event.id) }));
  }

  async markRead(userId: string, eventId: string) {
    const tenantId = this.tenant();
    const event = await this.prisma.outboxEvent.findFirst({ where: { id: eventId, tenantId } });
    if (!event) return { read: false };
    await this.prisma.notificationRead.upsert({ where: { userId_eventId: { userId, eventId } }, create: { tenantId, userId, eventId }, update: { readAt: new Date() } });
    return { read: true };
  }

  async activity() {
    const tenantId = this.tenant();
    return this.prisma.outboxEvent.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, type: true, payload: true, createdAt: true } });
  }

  /**
   * Create an outbox event.
   * This should be called within a transaction to ensure atomicity.
   */
  async createOutboxEvent(
    tenantId: string,
    type: string,
    payload: Record<string, any>,
  ): Promise<string> {
    const event = await this.prisma.outboxEvent.create({
      data: {
        tenantId,
        type,
        payload,
      },
    });

    this.logger.log(`Created outbox event: ${event.id} (${type})`);

    // Queue for processing
    await this.queueService.addOutboxJob(JOB_NAMES.PROCESS_OUTBOX_EVENT, {
      tenantId,
      eventId: event.id,
      payload: { eventId: event.id, type, ...payload },
    });

    return event.id;
  }

  /**
   * Send invoice email immediately (bypasses queue).
   */
  async sendInvoiceEmailNow(payload: {
    invoiceId: string;
    customerName: string;
    customerEmail: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    paymentLink?: string;
    pdfBuffer?: Buffer;
  }): Promise<void> {
    await this.emailHandler.sendInvoiceEmail(payload);
  }

  /**
   * Queue invoice email for async processing.
   */
  async queueInvoiceEmail(
    tenantId: string,
    payload: {
      invoiceId: string;
      customerName: string;
      customerEmail: string;
      invoiceNumber: string;
      amount: number;
      dueDate: string;
      paymentLink?: string;
    },
  ): Promise<void> {
    await this.queueService.addEmailJob(JOB_NAMES.SEND_INVOICE_EMAIL, {
      tenantId,
      eventId: payload.invoiceId,
      payload,
    });
  }

  /**
   * Send receipt email immediately (bypasses queue).
   */
  async sendReceiptEmailNow(payload: {
    paymentId: string;
    customerName: string;
    customerEmail: string;
    amount: number;
    paidAt: string;
    invoiceNumber?: string;
  }): Promise<void> {
    await this.emailHandler.sendReceiptEmail(payload);
  }

  /**
   * Queue receipt email for async processing.
   */
  async queueReceiptEmail(
    tenantId: string,
    payload: {
      paymentId: string;
      customerName: string;
      customerEmail: string;
      amount: number;
      paidAt: string;
      invoiceNumber?: string;
    },
  ): Promise<void> {
    await this.queueService.addEmailJob(JOB_NAMES.SEND_RECEIPT_EMAIL, {
      tenantId,
      eventId: payload.paymentId,
      payload,
    });
  }

  /**
   * Generate invoice PDF.
   */
  async generateInvoicePdf(
    tenantId: string,
    invoiceId: string,
    invoiceNumber?: string,
  ): Promise<{ filePath: string; fileName: string; size: number }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        customer: true,
        tenant: true,
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    const pdfData = {
      invoiceNumber: invoiceNumber || invoiceId,
      invoiceDate: invoice.createdAt.toISOString().split('T')[0],
      dueDate: invoice.dueDate.toISOString().split('T')[0],
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      items: [
        {
          description: `Invoice ${invoiceNumber || invoiceId}`,
          quantity: 1,
          unitPrice: invoice.amount,
          total: invoice.amount,
        },
      ],
      subtotal: invoice.amount,
      tax: 0,
      total: invoice.amount,
      tenantName: invoice.tenant.name,
    };

    return this.pdfGenerator.generateInvoicePdf(pdfData);
  }

  /**
   * Queue PDF generation for async processing.
   */
  async queuePdfGeneration(
    tenantId: string,
    invoiceId: string,
    invoiceNumber?: string,
  ): Promise<void> {
    await this.queueService.addPdfJob(JOB_NAMES.GENERATE_INVOICE_PDF, {
      tenantId,
      eventId: invoiceId,
      payload: { invoiceId, invoiceNumber },
    });
  }

  /**
   * Process pending outbox events.
   */
  async processPendingOutboxEvents(limit: number = 100): Promise<number> {
    return this.outboxProcessor.processUnprocessedEvents(limit);
  }

  /**
   * Get outbox event statistics.
   */
  async getOutboxStats(): Promise<{
    pending: number;
    processed: number;
    recentEvents: Array<{
      id: string;
      type: string;
      createdAt: Date;
      processedAt: Date | null;
    }>;
  }> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not available');
    }
    const where = { tenantId };

    const [pending, processed, recentEvents] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { ...where, processedAt: null } }),
      this.prisma.outboxEvent.count({ where: { ...where, processedAt: { not: null } } }),
      this.prisma.outboxEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          createdAt: true,
          processedAt: true,
        },
      }),
    ]);

    return { pending, processed, recentEvents };
  }

  /**
   * Get queue statistics.
   */
  async getQueueStats(): Promise<any> {
    return this.queueService.getQueueStats();
  }

  /**
   * Schedule recurring invoice processing.
   */
  async scheduleRecurringInvoices(): Promise<void> {
    await this.queueService.scheduleRecurringInvoiceCheck();
  }

  /**
   * Manually trigger recurring invoice generation for a tenant.
   */
  async triggerRecurringInvoiceGeneration(tenantId: string): Promise<number> {
    return this.tenantContext.run(tenantId, async () => {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          recurrenceRule: { not: null },
        },
        include: { customer: true },
      });

      let generated = 0;
      for (const invoice of invoices) {
        if (invoice.lastGeneratedAt) {
          const daysSince = Math.floor(
            (Date.now() - invoice.lastGeneratedAt.getTime()) / (1000 * 60 * 60 * 24),
          );

          const rule = invoice.recurrenceRule!.toLowerCase();
          let shouldGenerate = false;

          if (rule.includes('daily') && daysSince >= 1) shouldGenerate = true;
          if (rule.includes('weekly') && daysSince >= 7) shouldGenerate = true;
          if (rule.includes('monthly')) {
            const lastMonth = invoice.lastGeneratedAt.getMonth();
            const currentMonth = new Date().getMonth();
            shouldGenerate = currentMonth !== lastMonth;
          }

          if (shouldGenerate) {
            await this.prisma.invoice.create({
              data: {
                tenantId: invoice.tenantId,
                customerId: invoice.customerId,
                amount: invoice.amount,
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                recurrenceRule: invoice.recurrenceRule,
                status: 'SENT',
              },
            });

            await this.prisma.invoice.update({
              where: { id: invoice.id },
              data: { lastGeneratedAt: new Date() },
            });

            // Create outbox event for email
            await this.createOutboxEvent(invoice.tenantId, OutboxEventType.INVOICE_SENT, {
              invoiceId: invoice.id,
              customerId: invoice.customerId,
              customerName: invoice.customer.name,
              customerEmail: invoice.customer.email,
              amount: invoice.amount,
            });

            generated++;
          }
        }
      }

      return generated;
    });
  }
}
