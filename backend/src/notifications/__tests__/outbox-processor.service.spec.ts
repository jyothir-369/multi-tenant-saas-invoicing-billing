import { Test, TestingModule } from '@nestjs/testing';
import { OutboxProcessorService } from '../handlers/outbox-processor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { PdfGeneratorService } from '../adapters';
import { QueueService } from '../queues';
import { OutboxEventType } from '../dto';

describe('OutboxProcessorService', () => {
  let service: OutboxProcessorService;
  let prismaService: any;
  let tenantContext: any;
  let pdfGenerator: any;
  let queueService: any;

  const mockTenantId = 'tenant-1';

  beforeEach(async () => {
    const mockPrismaService = {
      outboxEvent: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockTenantContext = {
      run: jest.fn((tenantId, callback) => callback()),
    };

    const mockPdfGenerator = {
      generateInvoicePdf: jest.fn(),
    };

    const mockQueueService = {
      addEmailJob: jest.fn(),
      addPdfJob: jest.fn(),
      addOutboxJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContextService, useValue: mockTenantContext },
        { provide: PdfGeneratorService, useValue: mockPdfGenerator },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get<OutboxProcessorService>(OutboxProcessorService);
    prismaService = module.get(PrismaService);
    tenantContext = module.get(TenantContextService);
    pdfGenerator = module.get(PdfGeneratorService);
    queueService = module.get(QueueService);
  });

  describe('processUnprocessedEvents', () => {
    it('should process unprocessed events', async () => {
      const events = [
        { id: 'e1', type: OutboxEventType.INVOICE_SENT, payload: { invoiceId: 'inv-1' }, tenantId: mockTenantId },
        { id: 'e2', type: OutboxEventType.PAYMENT_RECEIVED, payload: { paymentId: 'pay-1' }, tenantId: mockTenantId },
      ];

      prismaService.outboxEvent.findMany.mockResolvedValue(events);
      prismaService.outboxEvent.update.mockResolvedValue({});
      queueService.addEmailJob.mockResolvedValue({ id: 'job-1' });
      queueService.addPdfJob.mockResolvedValue({ id: 'job-2' });

      const result = await service.processUnprocessedEvents(10);

      expect(result).toBe(2);
      expect(prismaService.outboxEvent.findMany).toHaveBeenCalledWith({
        where: { processedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
    });

    it('should return 0 when no events to process', async () => {
      prismaService.outboxEvent.findMany.mockResolvedValue([]);

      const result = await service.processUnprocessedEvents(10);

      expect(result).toBe(0);
    });
  });

  describe('processEvent', () => {
    it('should process event and mark as processed', async () => {
      const eventId = 'e1';
      const eventType = OutboxEventType.INVOICE_SENT;
      const payload = { invoiceId: 'inv-1', customerName: 'Test' };
      const tenantId = mockTenantId;

      prismaService.outboxEvent.update.mockResolvedValue({});

      const result = await service.processEvent(eventId, eventType, payload, tenantId);

      expect(result).toBe(true);
      expect(prismaService.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { processedAt: expect.any(Date) },
      });
    });

    it('should skip already processed events (idempotency)', async () => {
      // First processing
      prismaService.outboxEvent.update.mockResolvedValue({});
      await service.processEvent('e1', OutboxEventType.INVOICE_SENT, { invoiceId: 'inv-1' }, mockTenantId);

      // Second call with same ID should skip
      const result = await service.processEvent('e1', OutboxEventType.INVOICE_SENT, { invoiceId: 'inv-1' }, mockTenantId);

      expect(result).toBe(true);
      // Update should only be called once
      expect(prismaService.outboxEvent.update).toHaveBeenCalledTimes(1);
    });

    it('should queue email and PDF jobs for INVOICE_SENT event', async () => {
      const payload = { invoiceId: 'inv-1', tenantId: mockTenantId };

      prismaService.outboxEvent.update.mockResolvedValue({});
      queueService.addPdfJob.mockResolvedValue({ id: 'job-1' });
      queueService.addEmailJob.mockResolvedValue({ id: 'job-2' });

      await service.processEvent('e1', OutboxEventType.INVOICE_SENT, payload, mockTenantId);

      expect(queueService.addPdfJob).toHaveBeenCalled();
      expect(queueService.addEmailJob).toHaveBeenCalled();
    });

    it('should queue receipt email for PAYMENT_RECEIVED event', async () => {
      const payload = { paymentId: 'pay-1', tenantId: mockTenantId };

      prismaService.outboxEvent.update.mockResolvedValue({});
      queueService.addEmailJob.mockResolvedValue({ id: 'job-1' });

      await service.processEvent('e1', OutboxEventType.PAYMENT_RECEIVED, payload, mockTenantId);

      expect(queueService.addEmailJob).toHaveBeenCalledWith(
        'send-receipt-email',
        expect.objectContaining({
          tenantId: mockTenantId,
          eventId: 'pay-1',
          payload,
        }),
      );
    });

    it('should handle unknown event types gracefully', async () => {
      prismaService.outboxEvent.update.mockResolvedValue({});

      const result = await service.processEvent('e1', 'UNKNOWN_TYPE', {}, mockTenantId);

      expect(result).toBe(true); // Should not throw
    });
  });

  describe('clearProcessedEvents', () => {
    it('should clear the processed events cache', async () => {
      prismaService.outboxEvent.update.mockResolvedValue({});
      await service.processEvent('e1', OutboxEventType.INVOICE_SENT, {}, mockTenantId);
      
      expect(service.isEventProcessed('e1')).toBe(true);

      service.clearProcessedEvents();

      expect(service.isEventProcessed('e1')).toBe(false);
    });
  });
});
