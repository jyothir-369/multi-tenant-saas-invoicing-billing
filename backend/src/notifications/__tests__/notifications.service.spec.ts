import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { QueueService, JOB_NAMES } from '../queues';
import { OutboxProcessorService } from '../handlers';
import { EmailHandlerService } from '../handlers';
import { PdfGeneratorService } from '../adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { OutboxEventType } from '../dto';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaService: any;
  let tenantContext: any;
  let queueService: any;
  let outboxProcessor: any;
  let emailHandler: any;
  let pdfGenerator: any;

  const mockTenantId = 'tenant-1';
  const mockInvoiceId = 'invoice-1';

  beforeEach(async () => {
    const mockQueueService = {
      addEmailJob: jest.fn(),
      addPdfJob: jest.fn(),
      addOutboxJob: jest.fn(),
      addRecurringJob: jest.fn(),
      getQueueStats: jest.fn(),
    };

    const mockOutboxProcessor = {
      processUnprocessedEvents: jest.fn(),
    };

    const mockEmailHandler = {
      sendInvoiceEmail: jest.fn(),
      sendReceiptEmail: jest.fn(),
      sendOverdueReminder: jest.fn(),
      queueInvoiceEmail: jest.fn(),
      queueReceiptEmail: jest.fn(),
    };

    const mockPdfGenerator = {
      generateInvoicePdf: jest.fn(),
    };

    const mockPrismaService = {
      outboxEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      invoice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockTenantContext = {
      getTenantId: jest.fn().mockReturnValue(mockTenantId),
      run: jest.fn((tenantId, callback) => callback()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContextService, useValue: mockTenantContext },
        { provide: QueueService, useValue: mockQueueService },
        { provide: OutboxProcessorService, useValue: mockOutboxProcessor },
        { provide: EmailHandlerService, useValue: mockEmailHandler },
        { provide: PdfGeneratorService, useValue: mockPdfGenerator },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prismaService = module.get(PrismaService);
    tenantContext = module.get(TenantContextService);
    queueService = module.get(QueueService);
    outboxProcessor = module.get(OutboxProcessorService);
    emailHandler = module.get(EmailHandlerService);
    pdfGenerator = module.get(PdfGeneratorService);
  });

  describe('createOutboxEvent', () => {
    it('should create an outbox event and queue it for processing', async () => {
      const eventId = 'event-1';
      prismaService.outboxEvent.create.mockResolvedValue({ id: eventId });
      queueService.addOutboxJob.mockResolvedValue({ id: 'job-1' });

      const result = await service.createOutboxEvent(
        mockTenantId,
        OutboxEventType.INVOICE_SENT,
        { invoiceId: mockInvoiceId },
      );

      expect(result).toBe(eventId);
      expect(prismaService.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          tenantId: mockTenantId,
          type: OutboxEventType.INVOICE_SENT,
          payload: { invoiceId: mockInvoiceId },
        },
      });
      expect(queueService.addOutboxJob).toHaveBeenCalledWith(
        JOB_NAMES.PROCESS_OUTBOX_EVENT,
        expect.objectContaining({
          tenantId: mockTenantId,
          eventId,
          payload: expect.objectContaining({
            eventId,
            type: OutboxEventType.INVOICE_SENT,
            invoiceId: mockInvoiceId,
          }),
        }),
      );
    });
  });

  describe('sendInvoiceEmailNow', () => {
    it('should send invoice email immediately', async () => {
      const payload = {
        invoiceId: mockInvoiceId,
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        invoiceNumber: 'INV-001',
        amount: 10000,
        dueDate: '2024-12-31',
      };

      emailHandler.sendInvoiceEmail.mockResolvedValue(undefined);

      await service.sendInvoiceEmailNow(payload);

      expect(emailHandler.sendInvoiceEmail).toHaveBeenCalledWith(payload);
    });
  });

  describe('queueInvoiceEmail', () => {
    it('should queue invoice email for async processing', async () => {
      const payload = {
        invoiceId: mockInvoiceId,
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        invoiceNumber: 'INV-001',
        amount: 10000,
        dueDate: '2024-12-31',
      };

      queueService.addEmailJob.mockResolvedValue({ id: 'job-1' });

      await service.queueInvoiceEmail(mockTenantId, payload);

      expect(queueService.addEmailJob).toHaveBeenCalledWith(
        JOB_NAMES.SEND_INVOICE_EMAIL,
        expect.objectContaining({
          tenantId: mockTenantId,
          eventId: mockInvoiceId,
          payload,
        }),
      );
    });
  });

  describe('sendReceiptEmailNow', () => {
    it('should send receipt email immediately', async () => {
      const payload = {
        paymentId: 'payment-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        amount: 10000,
        paidAt: '2024-12-15',
        invoiceNumber: 'INV-001',
      };

      emailHandler.sendReceiptEmail.mockResolvedValue(undefined);

      await service.sendReceiptEmailNow(payload);

      expect(emailHandler.sendReceiptEmail).toHaveBeenCalledWith(payload);
    });
  });

  describe('generateInvoicePdf', () => {
    it('should generate invoice PDF', async () => {
      const invoice = {
        id: mockInvoiceId,
        tenantId: mockTenantId,
        amount: 10000,
        createdAt: new Date(),
        dueDate: new Date(),
        customer: { name: 'John Doe', email: 'john@example.com' },
        tenant: { name: 'Test Business' },
      };

      prismaService.invoice.findFirst.mockResolvedValue(invoice);
      pdfGenerator.generateInvoicePdf.mockResolvedValue({
        filePath: '/path/to/invoice.pdf',
        fileName: 'invoice.pdf',
        size: 1234,
      });

      const result = await service.generateInvoicePdf(mockTenantId, mockInvoiceId);

      expect(result.fileName).toBe('invoice.pdf');
      expect(pdfGenerator.generateInvoicePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceNumber: mockInvoiceId,
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          total: 10000,
        }),
      );
    });

    it('should throw error if invoice not found', async () => {
      prismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.generateInvoicePdf(mockTenantId, 'non-existent'),
      ).rejects.toThrow('Invoice non-existent not found');
    });
  });

  describe('processPendingOutboxEvents', () => {
    it('should process unprocessed events', async () => {
      outboxProcessor.processUnprocessedEvents.mockResolvedValue(5);

      const result = await service.processPendingOutboxEvents(100);

      expect(result).toBe(5);
      expect(outboxProcessor.processUnprocessedEvents).toHaveBeenCalledWith(100);
    });
  });

  describe('getOutboxStats', () => {
    it('should return outbox statistics', async () => {
      prismaService.outboxEvent.count
        .mockResolvedValueOnce(10) // pending
        .mockResolvedValueOnce(50); // processed
      prismaService.outboxEvent.findMany.mockResolvedValue([
        { id: 'e1', type: 'INVOICE_SENT', createdAt: new Date(), processedAt: new Date() },
      ]);

      const result = await service.getOutboxStats();

      expect(result.pending).toBe(10);
      expect(result.processed).toBe(50);
      expect(result.recentEvents).toHaveLength(1);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const mockStats = {
        email: { waiting: 5, active: 2, completed: 100, failed: 1 },
        pdf: { waiting: 1, active: 1, completed: 50, failed: 0 },
        outbox: { waiting: 3, active: 1, completed: 200, failed: 2 },
        recurring: { waiting: 0, active: 0, completed: 10, failed: 0 },
      };
      queueService.getQueueStats.mockResolvedValue(mockStats);

      const result = await service.getQueueStats();

      expect(result).toEqual(mockStats);
    });
  });
});
