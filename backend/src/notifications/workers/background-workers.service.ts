import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { QueueService, JOB_NAMES, QueueJobData } from '../queues';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { EmailHandlerService } from '../handlers';
import { PdfGeneratorService, InvoicePdfData } from '../adapters';
import { OutboxProcessorService } from '../handlers';

// How often the built-in recurring-invoice scheduler scans for due invoices.
// Falls back to an internal interval so the workflow works even without an
// external cron. Override with RECURRING_CHECK_INTERVAL_MS (in milliseconds).
const DEFAULT_RECURRING_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface InvoiceCounterRow {
  lastNumber: number;
}

@Injectable()
export class BackgroundWorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundWorkersService.name);

  private emailWorker: Worker;
  private pdfWorker: Worker;
  private outboxWorker: Worker;
  private recurringWorker: Worker;
  private recurringCheckTimer: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly queueService: QueueService,
    private readonly emailHandler: EmailHandlerService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly outboxProcessor: OutboxProcessorService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Skip worker initialization in test environment
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('Skipping worker initialization in test environment');
      return;
    }

    if (process.env.ENABLE_BACKGROUND_WORKERS !== 'true') {
      this.logger.log('Background workers disabled for web process; run start:worker separately');
      return;
    }

    const redisConfig = this.getRedisConfig();

    // Email worker
    this.emailWorker = new Worker(
      'email-notifications',
      async (job: Job) => this.processEmailJob(job),
      { connection: redisConfig, concurrency: 5 },
    );

    // PDF worker
    this.pdfWorker = new Worker(
      'pdf-generation',
      async (job: Job) => this.processPdfJob(job),
      { connection: redisConfig, concurrency: 2 },
    );

    // Outbox worker
    this.outboxWorker = new Worker(
      'outbox-processor',
      async (job: Job) => this.processOutboxJob(job),
      { connection: redisConfig, concurrency: 3 },
    );

    // Recurring invoice worker
    this.recurringWorker = new Worker(
      'recurring-invoices',
      async (job: Job) => this.processRecurringJob(job),
      { connection: redisConfig, concurrency: 1 },
    );

    // Set up event handlers
    this.setupWorkerEvents();

    // Start the recurring-invoice scheduler (also fires an initial scan).
    this.startRecurringScheduler();

    this.logger.log('Background workers initialized');
  }

  private startRecurringScheduler(): void {
    const intervalMs = Number(process.env.RECURRING_CHECK_INTERVAL_MS) || DEFAULT_RECURRING_CHECK_INTERVAL_MS;

    // Fire an initial scan shortly after boot.
    setTimeout(() => void this.checkAllTenantsRecurring(), 5_000);

    this.recurringCheckTimer = setInterval(
      () => void this.checkAllTenantsRecurring(),
      intervalMs,
    );
    this.recurringCheckTimer.unref?.();
    this.logger.log(`Recurring invoice scheduler running every ${intervalMs}ms`);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.recurringCheckTimer);
    await Promise.all([
      this.emailWorker?.close(),
      this.pdfWorker?.close(),
      this.outboxWorker?.close(),
      this.recurringWorker?.close(),
    ]);
    this.logger.log('Background workers closed');
  }

  private getRedisConfig(): any {
    if (process.env.REDIS_URL) {
      return { url: process.env.REDIS_URL, maxRetriesPerRequest: null, connectTimeout: 2000, enableOfflineQueue: false };
    }
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD;
    const tlsEnabled = process.env.REDIS_TLS === 'true';

    return {
      host,
      port,
      ...(password ? { password } : {}),
      ...(tlsEnabled ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
      enableOfflineQueue: false,
    };
  }

  private setupWorkerEvents(): void {
    const workers = [
      { worker: this.emailWorker, name: 'Email' },
      { worker: this.pdfWorker, name: 'PDF' },
      { worker: this.outboxWorker, name: 'Outbox' },
      { worker: this.recurringWorker, name: 'Recurring' },
    ];

    for (const { worker, name } of workers) {
      worker.on('completed', (job) => {
        this.logger.log(`${name} worker: Job ${job.id} completed`);
      });

      worker.on('failed', (job, err) => {
        this.logger.error(`${name} worker: Job ${job?.id} failed: ${err.message}`);
      });

      worker.on('error', (err) => {
        this.logger.error(`${name} worker error: ${err.message}`);
      });
    }
  }

  /**
   * Process email jobs.
   */
  private async processEmailJob(job: Job): Promise<void> {
    const data = job.data as QueueJobData;
    const { tenantId, payload } = data;

    this.logger.log(`Processing email job: ${job.name} for tenant ${tenantId}`);

    await this.tenantContext.run(tenantId, async () => {
      switch (job.name) {
        case JOB_NAMES.SEND_INVOICE_EMAIL:
          await this.emailHandler.sendInvoiceEmail({
            invoiceId: payload.invoiceId,
            customerName: payload.customerName || payload.customer?.name,
            customerEmail: payload.customerEmail || payload.customer?.email,
            invoiceNumber: payload.invoiceNumber || payload.invoiceId,
            amount: payload.amount,
            dueDate: payload.dueDate,
            paymentLink: payload.paymentLink,
            pdfBuffer: payload.pdfBuffer || (payload.pdfPath ? await readFile(payload.pdfPath) : undefined),
          });
          break;

        case JOB_NAMES.SEND_RECEIPT_EMAIL:
          await this.emailHandler.sendReceiptEmail({
            paymentId: payload.paymentId,
            customerName: payload.customerName || payload.customer?.name,
            customerEmail: payload.customerEmail || payload.customer?.email,
            amount: payload.amount,
            paidAt: payload.paidAt,
            invoiceNumber: payload.invoiceNumber,
          });
          break;

        case JOB_NAMES.SEND_OVERDUE_REMINDER:
          await this.emailHandler.sendOverdueReminder({
            invoiceId: payload.invoiceId,
            customerName: payload.customerName,
            customerEmail: payload.customerEmail,
            invoiceNumber: payload.invoiceNumber,
            amount: payload.amount,
            dueDate: payload.dueDate,
            daysOverdue: payload.daysOverdue,
            paymentLink: payload.paymentLink,
          });
          break;

        default:
          this.logger.warn(`Unknown email job type: ${job.name}`);
      }
    });
  }

  /**
   * Process PDF generation jobs.
   */
  private async processPdfJob(job: Job): Promise<{ filePath: string }> {
    const data = job.data as QueueJobData;
    const { tenantId, payload } = data;

    this.logger.log(`Processing PDF job: ${job.name} for tenant ${tenantId}`);

    let filePath = '';
    
    await this.tenantContext.run(tenantId, async () => {
      switch (job.name) {
        case JOB_NAMES.GENERATE_INVOICE_PDF:
          // Fetch invoice data from database
          const invoice = await this.prisma.invoice.findFirst({
      where: { id: payload.invoiceId, tenantId },
            include: {
              customer: true,
              tenant: true,
            },
          });

          if (!invoice) {
            throw new Error(`Invoice ${payload.invoiceId} not found`);
          }

          const pdfData: InvoicePdfData = {
            invoiceNumber: payload.invoiceNumber || payload.invoiceId,
            invoiceDate: invoice.createdAt.toISOString().split('T')[0],
            dueDate: invoice.dueDate.toISOString().split('T')[0],
            customerName: invoice.customer.name,
            customerEmail: invoice.customer.email,
            items: [
              {
                description: `Invoice ${payload.invoiceNumber || payload.invoiceId}`,
                quantity: 1,
                unitPrice: invoice.totalCents,
                total: invoice.totalCents,
              },
            ],
            subtotal: invoice.totalCents,
            tax: 0,
            total: invoice.totalCents,
            tenantName: invoice.tenant.name,
            tenantEmail: invoice.tenant.id, // In real app, store email in tenant
            paymentLink: payload.paymentLink,
            requiresSignature: invoice.requiresSignature,
            signatureName: invoice.signatureName,
            signatureEmail: invoice.signatureEmail,
            signedAt: invoice.signedAt ? invoice.signedAt.toISOString().split('T')[0] : null,
          };

          const result = await this.pdfGenerator.generateInvoicePdf(pdfData);
          filePath = result.filePath;
          
          // Queue email with PDF attached
          await this.emailHandler.queueInvoiceEmail({
            tenantId,
            eventId: payload.invoiceId,
            payload: {
              ...payload,
              pdfBuffer: undefined, // Will be loaded from file
              pdfPath: result.filePath,
            },
          });
          break;

        default:
          this.logger.warn(`Unknown PDF job type: ${job.name}`);
      }
    });

    return { filePath };
  }

  /**
   * Process outbox event jobs.
   */
  private async processOutboxJob(job: Job): Promise<void> {
    const data = job.data as QueueJobData;
    const { tenantId } = data;

    this.logger.log(`Processing outbox job for tenant ${tenantId}`);

    // Process unprocessed events
    const processed = await this.outboxProcessor.processUnprocessedEvents(50, tenantId);
    this.logger.log(`Processed ${processed} outbox events`);
    // Throwing makes BullMQ apply its configured exponential retry policy.
    // A successful empty batch is still a successful job.
    if (processed === 0) {
      const pending = await this.prisma.outboxEvent.count({ where: { processedAt: null, tenantId } });
      if (pending > 0) throw new Error(`Failed to process outbox events for tenant ${tenantId}`);
    }
  }

  /**
   * Process recurring invoice jobs (enqueued per-tenant).
   */
  private async processRecurringJob(job: Job): Promise<void> {
    const data = job.data as QueueJobData;
    const { tenantId } = data;

    this.logger.log(`Processing recurring invoice job for tenant ${tenantId}`);

    await this.tenantContext.run(tenantId, async () => {
      const generated = await this.checkTenantRecurring(tenantId);
      this.logger.log(`Recurring invoice check for ${tenantId}: generated ${generated}`);
    });
  }

  /**
   * Scheduler entry point: scan every tenant for due recurring invoices.
   * This is what makes the "recurring" side of billing actually run.
   */
  async checkAllTenantsRecurring(): Promise<number> {
    try {
      const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
      let total = 0;
      for (const tenant of tenants) {
        await this.tenantContext.run(tenant.id, async () => {
          total += await this.checkTenantRecurring(tenant.id);
        });
      }
      if (total > 0) {
        this.logger.log(`Recurring scheduler generated ${total} invoice(s) across ${tenants.length} tenant(s)`);
      }
      return total;
    } catch (err) {
      this.logger.error(`Recurring scheduler scan failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * Generate any due recurring invoices for a single tenant.
   * A series advances when the latest instance is paid or overdue and the
   * recurrence period since the last generation has elapsed. Generated
   * instances inherit the recurrence rule, so the chain continues as each
   * instance is paid — one invoice per period, no runaway generation.
   */
  async checkTenantRecurring(tenantId: string): Promise<number> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        recurrenceRule: { not: null },
        status: { in: ['PAID', 'OVERDUE'] },
      },
      include: { customer: true, lineItems: true },
    });

    let generated = 0;
    for (const invoice of invoices) {
      if (!this.isDueForRecurrence(invoice.recurrenceRule!, invoice.lastGeneratedAt)) {
        continue;
      }
      this.logger.log(`Generating next recurring invoice from ${invoice.number || invoice.id}`);
      await this.generateRecurringInvoice(invoice);
      generated++;
    }
    return generated;
  }

  /**
   * Clone a recurring "template" invoice into the next payable instance:
   * copies line items, assigns the next number, marks it SENT, creates a
   * customer-facing payment link, and raises an INVOICE_SENT outbox event so
   * the notification pipeline emails the customer.
   */
  private async generateRecurringInvoice(parent: {
    id: string;
    tenantId: string;
    customerId: string;
    customer: { name: string; email: string };
    number: string;
    totalCents: number;
    subtotalCents: number;
    taxCents: number;
    discountCents: number;
    recurrenceRule: string | null;
    requiresSignature: boolean;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPriceCents: number;
      taxRateBps: number;
      subtotalCents: number;
    }>;
  }): Promise<void> {
    const year = new Date().getFullYear();
    const number = await this.generateInvoiceNumber(parent.tenantId, year);
    const dueDate = this.calculateNextDueDate(parent.recurrenceRule!);
    const prefix = process.env.FRONTEND_URL || 'http://localhost:3000';

    await this.prisma.$transaction(async (tx) => {
      const child = await tx.invoice.create({
        data: {
          tenantId: parent.tenantId,
          customerId: parent.customerId,
          number,
          status: 'SENT',
          dueDate,
          recurrenceRule: parent.recurrenceRule,
          requiresSignature: parent.requiresSignature,
          subtotalCents: parent.subtotalCents,
          taxCents: parent.taxCents,
          discountCents: parent.discountCents,
          totalCents: parent.totalCents,
        },
      });

      // Copy line items across so the generated invoice is complete, not a shell.
      for (const item of parent.lineItems) {
        await tx.lineItem.create({
          data: {
            invoiceId: child.id,
            tenantId: parent.tenantId,
            description: item.description,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            taxRateBps: item.taxRateBps,
            subtotalCents: item.subtotalCents,
          },
        });
      }

      // Create a payable payment link for the new invoice.
      const token = randomBytes(32).toString('hex');
      await tx.paymentLink.create({
        data: {
          tenantId: parent.tenantId,
          invoiceId: child.id,
          token,
          amountCents: parent.totalCents,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
      });

      // Queue the "invoice sent" email via the outbox.
      await tx.outboxEvent.create({
        data: {
          tenantId: parent.tenantId,
          type: 'INVOICE_SENT',
          payload: {
            invoiceId: child.id,
            customerId: parent.customerId,
            customerName: parent.customer.name,
            customerEmail: parent.customer.email,
            invoiceNumber: number,
            amount: parent.totalCents,
            dueDate: dueDate.toISOString(),
            paymentLink: `${prefix}/pay/${token}`,
          },
        },
      });

      // Mark the source as generated so the next scan waits a full period.
      await tx.invoice.update({
        where: { id: parent.id },
        data: { lastGeneratedAt: new Date() },
      });
    });
  }

  /**
   * Allocate the next sequential invoice number for a tenant/year.
   * Uses an upsert on invoice_counters so concurrent runs never collide.
   */
  private async generateInvoiceNumber(tenantId: string, year: number): Promise<string> {
    try {
      const row = await this.prisma.$queryRaw<InvoiceCounterRow[]>`
        UPDATE invoice_counters
        SET last_number = last_number + 1
        WHERE tenant_id = ${tenantId} AND year = ${year}
        RETURNING last_number
      `;

      if (row.length === 0) {
        await this.prisma.$executeRaw`
          INSERT INTO invoice_counters (id, tenant_id, year, last_number)
          VALUES (gen_random_uuid(), ${tenantId}, ${year}, 1)
        `;
        return `INV-${year}-${String(1).padStart(6, '0')}`;
      }

      return `INV-${year}-${String(row[0].lastNumber).padStart(6, '0')}`;
    } catch (err) {
      this.logger.warn(`Invoice counter unavailable (${(err as Error).message}); using time-based number`);
      return `INV-${year}-${String(Date.now() % 1000000).padStart(6, '0')}`;
    }
  }

  /**
   * Check if invoice is due for recurrence.
   */
  private isDueForRecurrence(recurrenceRule: string, lastGenerated: Date | null): boolean {
    const rule = recurrenceRule.toLowerCase();
    const periodMs = this.recurrencePeriodMs(rule);
    if (!periodMs) return false;

    // First generation: a paid/overdue series with no prior child is due now.
    if (!lastGenerated) return true;

    return Date.now() - lastGenerated.getTime() >= periodMs;
  }

  /**
   * Recurrence period in milliseconds for a rule. Returns 0 for unknown rules.
   */
  private recurrencePeriodMs(rule: string): number {
    const DAY = 86400000;
    if (rule.includes('daily')) return DAY;
    if (rule.includes('weekly')) return 7 * DAY;
    if (rule.includes('monthly')) return 30 * DAY;
    if (rule.includes('quarterly')) return 91 * DAY;
    if (rule.includes('yearly') || rule.includes('annual')) return 365 * DAY;
    return 0;
  }

  /**
   * Calculate next due date based on recurrence rule.
   */
  private calculateNextDueDate(recurrenceRule: string): Date {
    const dueDate = new Date();
    const rule = recurrenceRule.toLowerCase();

    if (rule.includes('daily')) {
      dueDate.setDate(dueDate.getDate() + 1);
    } else if (rule.includes('weekly')) {
      dueDate.setDate(dueDate.getDate() + 7);
    } else if (rule.includes('quarterly')) {
      dueDate.setMonth(dueDate.getMonth() + 3);
    } else if (rule.includes('yearly') || rule.includes('annual')) {
      dueDate.setFullYear(dueDate.getFullYear() + 1);
    } else {
      dueDate.setMonth(dueDate.getMonth() + 1); // Default to monthly
    }

    return dueDate;
  }
}
