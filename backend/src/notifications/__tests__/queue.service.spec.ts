import { Test, TestingModule } from '@nestjs/testing';
import { QueueService, QUEUE_NAMES, JOB_NAMES, RETRY_CONFIG } from '../queues/queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(async () => {
    // Mock Redis config
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';

    const mockPrismaService = {};
    const mockTenantContext = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContextService, useValue: mockTenantContext },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
  });

  describe('constants', () => {
    it('should have correct queue names', () => {
      expect(QUEUE_NAMES.EMAIL).toBe('email-notifications');
      expect(QUEUE_NAMES.PDF).toBe('pdf-generation');
      expect(QUEUE_NAMES.OUTBOX).toBe('outbox-processor');
      expect(QUEUE_NAMES.RECURRING).toBe('recurring-invoices');
    });

    it('should have correct job names', () => {
      expect(JOB_NAMES.SEND_INVOICE_EMAIL).toBe('send-invoice-email');
      expect(JOB_NAMES.SEND_RECEIPT_EMAIL).toBe('send-receipt-email');
      expect(JOB_NAMES.GENERATE_INVOICE_PDF).toBe('generate-invoice-pdf');
      expect(JOB_NAMES.PROCESS_OUTBOX_EVENT).toBe('process-outbox-event');
    });

    it('should have correct retry configuration', () => {
      expect(RETRY_CONFIG.maxRetries).toBe(3);
      expect(RETRY_CONFIG.initialDelay).toBe(1000);
      expect(RETRY_CONFIG.maxDelay).toBe(60000);
      expect(RETRY_CONFIG.backoffMultiplier).toBe(2);
    });
  });

  describe('getRedisConfig', () => {
    it('should return Redis config from environment variables', () => {
      // Access private method for testing
      const getRedisConfig = (service as any).getRedisConfig.bind(service);
      const config = getRedisConfig();

      expect(config.host).toBe('localhost');
      expect(config.port).toBe(6379);
    });

    it('should handle custom Redis port', () => {
      process.env.REDIS_PORT = '6380';
      
      const getRedisConfig = (service as any).getRedisConfig.bind(service);
      const config = getRedisConfig();

      expect(config.port).toBe(6380);
    });
  });
});

describe('Retry Configuration', () => {
  describe('exponential backoff calculation', () => {
    it('should calculate correct delay for first retry', () => {
      const delay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, 0);
      expect(delay).toBe(1000); // 1 second
    });

    it('should calculate correct delay for second retry', () => {
      const delay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, 1);
      expect(delay).toBe(2000); // 2 seconds
    });

    it('should calculate correct delay for third retry', () => {
      const delay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, 2);
      expect(delay).toBe(4000); // 4 seconds
    });

    it('should not exceed max delay', () => {
      const excessiveDelay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, 10);
      expect(Math.min(excessiveDelay, RETRY_CONFIG.maxDelay)).toBe(RETRY_CONFIG.maxDelay);
    });
  });

  describe('max retries', () => {
    it('should allow configured number of retries', () => {
      expect(RETRY_CONFIG.maxRetries).toBeGreaterThan(0);
      expect(RETRY_CONFIG.maxRetries).toBeLessThanOrEqual(10);
    });
  });
});

describe('Queue Names Consistency', () => {
  it('should have unique queue names', () => {
    const queues = Object.values(QUEUE_NAMES);
    const uniqueQueues = new Set(queues);
    expect(uniqueQueues.size).toBe(queues.length);
  });

  it('should have unique job names', () => {
    const jobs = Object.values(JOB_NAMES);
    const uniqueJobs = new Set(jobs);
    expect(uniqueJobs.size).toBe(jobs.length);
  });
});
