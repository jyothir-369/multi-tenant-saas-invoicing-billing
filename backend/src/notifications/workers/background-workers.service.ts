import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { QueueService, JOB_NAMES, QueueJobData } from '../queues';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { EmailHandlerService } from '../handlers';
import { PdfGeneratorService, InvoicePdfData } from '../adapters';
import { OutboxProcessorService } from '../handlers';

@Injectable()
export class BackgroundWorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundWorkersService.name);

  private emailWorker: Worker;
  private pdfWorker: Worker;
  private outboxWorker: Worker;
  private recurringWorker: Worker;

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

    this.logger.log('Background workers initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.emailWorker?.close(),
      this.pdfWorker?.close(),
      this.outboxWorker?.close(),
      this.recurringWorker?.close(),
    ]);
    this.logger.log('Background workers closed');
  }

  private getRedisConfig(): any {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    return {
      host,
      port,
      maxRetriesPerRequest: null,
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
            pdfBuffer: payload.pdfBuffer,
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
                unitPrice: invoice.amount,
                total: invoice.amount,
              },
            ],
            subtotal: invoice.amount,
            tax: 0,
            total: invoice.amount,
            tenantName: invoice.tenant.name,
            tenantEmail: invoice.tenant.id, // In real app, store email in tenant
            paymentLink: payload.paymentLink,
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
   * Process recurring invoice jobs.
   */
  private async processRecurringJob(job: Job): Promise<void> {
    const data = job.data as QueueJobData;
    const { tenantId, payload } = data;

    this.logger.log(`Processing recurring invoice job for tenant ${tenantId}`);

    await this.tenantContext.run(tenantId, async () => {
      // Find invoices with recurrence rules that are due
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          recurrenceRule: { not: null },
          status: 'PAID', // Last instance was paid
        },
        include: {
          customer: true,
        },
      });

      for (const invoice of invoices) {
        // Check if it's time to generate next invoice based on recurrence rule
        if (this.isDueForRecurrence(invoice.recurrenceRule!, invoice.lastGeneratedAt)) {
          this.logger.log(`Generating recurring invoice for ${invoice.id}`);
          
          // Create new invoice based on recurring rule
          await this.prisma.invoice.create({
            data: {
              tenantId: invoice.tenantId,
              customerId: invoice.customerId,
              amount: invoice.amount,
              dueDate: this.calculateNextDueDate(invoice.recurrenceRule!),
              recurrenceRule: invoice.recurrenceRule,
              status: 'SENT',
            },
          });

          // Update lastGeneratedAt
          await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { lastGeneratedAt: new Date() },
          });
        }
      }
    });
  }

  /**
   * Check if invoice is due for recurrence.
   */
  private isDueForRecurrence(recurrenceRule: string, lastGenerated: Date | null): boolean {
    if (!lastGenerated) return true;

    const lastDate = new Date(lastGenerated);
    const now = new Date();

    // Simple rule parsing (e.g., "monthly", "weekly", "daily")
    const rule = recurrenceRule.toLowerCase();

    if (rule.includes('daily')) {
      const daysDiff = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= 1;
    }

    if (rule.includes('weekly')) {
      const daysDiff = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= 7;
    }

    if (rule.includes('monthly')) {
      return now.getMonth() !== lastDate.getMonth() || now.getFullYear() !== lastDate.getFullYear();
    }

    return false;
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
    } else if (rule.includes('monthly')) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    } else {
      dueDate.setMonth(dueDate.getMonth() + 1); // Default to monthly
    }

    return dueDate;
  }
}
