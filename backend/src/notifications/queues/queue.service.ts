import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';

// Queue names
export const QUEUE_NAMES = {
  EMAIL: 'email-notifications',
  PDF: 'pdf-generation',
  OUTBOX: 'outbox-processor',
  RECURRING: 'recurring-invoices',
} as const;

// Job names
export const JOB_NAMES = {
  SEND_INVOICE_EMAIL: 'send-invoice-email',
  SEND_RECEIPT_EMAIL: 'send-receipt-email',
  SEND_OVERDUE_REMINDER: 'send-overdue-reminder',
  GENERATE_INVOICE_PDF: 'generate-invoice-pdf',
  PROCESS_OUTBOX_EVENT: 'process-outbox-event',
  GENERATE_RECURRING_INVOICE: 'generate-recurring-invoice',
} as const;

// Retry configuration with bounded backoff
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 60000, // 1 minute
  backoffMultiplier: 2,
};

export interface QueueJobData {
  tenantId: string;
  eventId?: string;
  payload: Record<string, any>;
  attemptNumber?: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  
  private emailQueue: Queue;
  private pdfQueue: Queue;
  private outboxQueue: Queue;
  private recurringQueue: Queue;
  
  private emailWorker: Worker;
  private pdfWorker: Worker;
  private outboxWorker: Worker;
  private recurringWorker: Worker;
  
  private queueEvents: QueueEvents[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisConfig = this.getRedisConfig();
    
    // Initialize queues
    this.emailQueue = new Queue(QUEUE_NAMES.EMAIL, { connection: redisConfig });
    this.pdfQueue = new Queue(QUEUE_NAMES.PDF, { connection: redisConfig });
    this.outboxQueue = new Queue(QUEUE_NAMES.OUTBOX, { connection: redisConfig });
    this.recurringQueue = new Queue(QUEUE_NAMES.RECURRING, { connection: redisConfig });

    // Initialize queue event listeners
    this.setupQueueEvents();

    this.logger.log('Queue service initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.cleanup();
  }

  private getRedisConfig(): any {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    
    // For development without Redis, use mock behavior
    if (process.env.NODE_ENV === 'development' && !process.env.REDIS_URL) {
      return {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
      };
    }

    return {
      host,
      port,
      maxRetriesPerRequest: null,
    };
  }

  private setupQueueEvents(): void {
    const queues = [this.emailQueue, this.pdfQueue, this.outboxQueue, this.recurringQueue];
    
    for (const queue of queues) {
      const events = new QueueEvents(queue.name, { connection: this.getRedisConfig() });
      this.queueEvents.push(events);

      events.on('completed', ({ jobId }) => {
        this.logger.log(`Job ${jobId} completed successfully`);
      });

      events.on('failed', ({ jobId, failedReason }) => {
        this.logger.error(`Job ${jobId} failed: ${failedReason}`);
      });

      events.on('retries-exhausted', ({ jobId }) => {
        this.logger.error(`Job ${jobId} exhausted all retries`);
      });
    }
  }

  // Email queue operations
  async addEmailJob(
    jobName: string,
    data: QueueJobData,
    options?: { delay?: number; attempts?: number },
  ): Promise<Job> {
    const job = await this.emailQueue.add(jobName, data, {
      delay: options?.delay,
      attempts: options?.attempts || RETRY_CONFIG.maxRetries,
      backoff: {
        type: 'exponential',
        delay: RETRY_CONFIG.initialDelay,
      },
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    });

    this.logger.log(`Email job added: ${jobName} (ID: ${job.id})`);
    return job;
  }

  // PDF queue operations
  async addPdfJob(
    jobName: string,
    data: QueueJobData,
    options?: { delay?: number; attempts?: number },
  ): Promise<Job> {
    const job = await this.pdfQueue.add(jobName, data, {
      delay: options?.delay,
      attempts: options?.attempts || RETRY_CONFIG.maxRetries,
      backoff: {
        type: 'exponential',
        delay: RETRY_CONFIG.initialDelay,
      },
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    });

    this.logger.log(`PDF job added: ${jobName} (ID: ${job.id})`);
    return job;
  }

  // Outbox queue operations
  async addOutboxJob(
    jobName: string,
    data: QueueJobData,
    options?: { delay?: number; attempts?: number },
  ): Promise<Job> {
    const job = await this.outboxQueue.add(jobName, data, {
      delay: options?.delay,
      attempts: options?.attempts || RETRY_CONFIG.maxRetries,
      backoff: {
        type: 'exponential',
        delay: RETRY_CONFIG.initialDelay,
      },
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    });

    this.logger.log(`Outbox job added: ${jobName} (ID: ${job.id})`);
    return job;
  }

  // Recurring invoice queue operations
  async addRecurringJob(
    jobName: string,
    data: QueueJobData,
    options?: { delay?: number; attempts?: number },
  ): Promise<Job> {
    const job = await this.recurringQueue.add(jobName, data, {
      delay: options?.delay,
      attempts: options?.attempts || RETRY_CONFIG.maxRetries,
      backoff: {
        type: 'exponential',
        delay: RETRY_CONFIG.initialDelay,
      },
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    });

    this.logger.log(`Recurring job added: ${jobName} (ID: ${job.id})`);
    return job;
  }

  // Schedule recurring invoice check
  async scheduleRecurringInvoiceCheck(): Promise<void> {
    // Note: repeat option requires BullMQ Pro or specific configuration
    // For open source version, this would be handled by an external scheduler
    this.logger.log('Recurring invoice check scheduling - use external cron in production');
  }

  // Get queue stats
  async getQueueStats(): Promise<{
    email: { waiting: number; active: number; completed: number; failed: number };
    pdf: { waiting: number; active: number; completed: number; failed: number };
    outbox: { waiting: number; active: number; completed: number; failed: number };
    recurring: { waiting: number; active: number; completed: number; failed: number };
  }> {
    const getCounts = async (queue: Queue) => {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);
      return { waiting, active, completed, failed };
    };

    return {
      email: await getCounts(this.emailQueue),
      pdf: await getCounts(this.pdfQueue),
      outbox: await getCounts(this.outboxQueue),
      recurring: await getCounts(this.recurringQueue),
    };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    this.logger.log('Cleaning up queue service...');
    
    await this.emailWorker?.close();
    await this.pdfWorker?.close();
    await this.outboxWorker?.close();
    await this.recurringWorker?.close();
    
    for (const events of this.queueEvents) {
      await events.close();
    }
    
    await Promise.all([
      this.emailQueue?.close(),
      this.pdfQueue?.close(),
      this.outboxQueue?.close(),
      this.recurringQueue?.close(),
    ]);
    
    this.logger.log('Queue service cleaned up');
  }
}
