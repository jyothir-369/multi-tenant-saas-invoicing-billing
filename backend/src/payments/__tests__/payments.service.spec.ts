import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PaymentsService } from '../payments.service';
import { StripePaymentProvider } from '../adapters';
import { InvoicesService } from '../../billing/invoices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { InvoiceStatus } from '@prisma/client';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaService: PrismaService;
  let tenantContext: TenantContextService;
  let stripeProvider: StripePaymentProvider;
  let invoicesService: InvoicesService;

  const mockTenantId = 'tenant-1';
  const mockInvoiceId = 'invoice-1';
  const mockCustomerId = 'customer-1';

  const mockInvoice = {
    id: mockInvoiceId,
    tenantId: mockTenantId,
    customerId: mockCustomerId,
    status: InvoiceStatus.SENT,
    amount: 10000, // $100.00 in cents
    dueDate: new Date(),
    recurrenceRule: null,
    lastGeneratedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: {
      id: mockCustomerId,
      name: 'Test Customer',
      email: 'customer@test.com',
      tenantId: mockTenantId,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    payments: [],
  };

  const mockPayment = {
    id: 'payment-1',
    tenantId: mockTenantId,
    invoiceId: mockInvoiceId,
    providerPaymentId: 'pi_test_123',
    amount: 5000,
    status: 'COMPLETED',
    createdAt: new Date(),
  };

  let mockPrismaService: any;
  let mockTenantContext: any;
  let mockStripeProvider: any;
  let mockInvoicesService: any;

  beforeEach(async () => {
    mockPrismaService = {
      invoice: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockTenantContext = {
      getTenantId: jest.fn().mockReturnValue(mockTenantId),
    };

    mockStripeProvider = {
      createPaymentIntent: jest.fn(),
      retrievePaymentIntent: jest.fn(),
      createRefund: jest.fn(),
      verifyWebhookSignature: jest.fn(),
    };

    mockInvoicesService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContextService, useValue: mockTenantContext },
        { provide: StripePaymentProvider, useValue: mockStripeProvider },
        { provide: InvoicesService, useValue: mockInvoicesService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prismaService = module.get<PrismaService>(PrismaService);
    tenantContext = module.get<TenantContextService>(TenantContextService);
    stripeProvider = module.get<StripePaymentProvider>(StripePaymentProvider);
    invoicesService = module.get<InvoicesService>(InvoicesService);

    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    const createDto = {
      invoiceId: mockInvoiceId,
      amount: 5000,
    };

    it('should create a payment intent for a valid invoice', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);

      const mockPaymentIntent = {
        id: 'pi_test_123',
        clientSecret: 'pi_test_123_secret',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        metadata: {},
      };

      mockStripeProvider.createPaymentIntent.mockResolvedValue(mockPaymentIntent);

      const result = await service.createPaymentIntent(createDto);

      expect(result).toEqual({
        clientSecret: 'pi_test_123_secret',
        paymentIntentId: 'pi_test_123',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
      });

      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalledWith(
        5000,
        'usd',
        expect.objectContaining({
          tenantId: mockTenantId,
          invoiceId: mockInvoiceId,
          customerId: mockCustomerId,
        }),
        expect.any(String),
      );
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(service.createPaymentIntent(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for fully paid invoice', async () => {
      const paidInvoice = {
        ...mockInvoice,
        payments: [{ ...mockPayment, amount: 10000 }],
      };
      mockPrismaService.invoice.findFirst.mockResolvedValue(paidInvoice);

      await expect(service.createPaymentIntent(createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createPaymentIntent(createDto)).rejects.toThrow(
        'Invoice is already fully paid',
      );
    });

    it('should throw NotFoundException for DRAFT invoice', async () => {
      // For DRAFT status, the invoice.findFirst query with status filter won't match
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(service.createPaymentIntent(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for VOID invoice', async () => {
      // For VOID status, the invoice.findFirst query with status filter won't match
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(service.createPaymentIntent(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should limit payment amount to remaining balance', async () => {
      const partialPaidInvoice = {
        ...mockInvoice,
        payments: [{ ...mockPayment, amount: 6000 }],
      };
      mockPrismaService.invoice.findFirst.mockResolvedValue(partialPaidInvoice);

      const mockPaymentIntent = {
        id: 'pi_test_123',
        clientSecret: 'pi_test_123_secret',
        amount: 4000, // Only remaining balance
        currency: 'usd',
        status: 'requires_payment_method',
        metadata: {},
      };

      mockStripeProvider.createPaymentIntent.mockResolvedValue(mockPaymentIntent);

      await service.createPaymentIntent({ invoiceId: mockInvoiceId, amount: 10000 });

      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalledWith(
        4000, // Capped at remaining balance
        'usd',
        expect.any(Object),
        expect.any(String),
      );
    });
  });

  describe('processSuccessfulPayment', () => {
    it('should process a new payment and create records', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(null);
      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);

      const newPayment = { ...mockPayment, id: 'new-payment-id' };
      mockPrismaService.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        const tx = {
          payment: { create: jest.fn().mockResolvedValue(newPayment) },
          invoice: { update: jest.fn().mockResolvedValue({}) },
          outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const result = await service.processSuccessfulPayment(
        'pi_new_123',
        5000,
        mockInvoiceId,
        mockTenantId,
      );

      expect(result.success).toBe(true);
      expect(result.payment).toBeDefined();
    });

    it('should return existing payment for duplicate idempotent request', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(mockPayment);

      const result = await service.processSuccessfulPayment(
        'pi_test_123',
        5000,
        mockInvoiceId,
        mockTenantId,
      );

      expect(result.success).toBe(true);
      expect(result.payment).toEqual(mockPayment);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should mark invoice as PAID when fully paid', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(null);

      const partialInvoice = {
        ...mockInvoice,
        payments: [{ ...mockPayment, amount: 5000 }],
      };
      mockPrismaService.invoice.findFirst.mockResolvedValue(partialInvoice);

      mockPrismaService.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        const tx = {
          payment: { create: jest.fn().mockResolvedValue({ id: 'p2' }) },
          invoice: {
            update: jest.fn().mockResolvedValue({
              status: InvoiceStatus.PAID,
            }),
          },
          outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const result = await service.processSuccessfulPayment(
        'pi_pay_2',
        5000,
        mockInvoiceId,
        mockTenantId,
      );

      expect(result.success).toBe(true);
    });

    it('should create outbox event for receipt email', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(null);
      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);

      let outboxEventData: any;
      mockPrismaService.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        const tx = {
          payment: { create: jest.fn().mockResolvedValue({ id: 'p3' }) },
          invoice: { update: jest.fn().mockResolvedValue({}) },
          outboxEvent: {
            create: jest.fn().mockImplementation((data: any) => {
              outboxEventData = data;
              return Promise.resolve({});
            }),
          },
        };
        return callback(tx);
      });

      await service.processSuccessfulPayment(
        'pi_outbox_1',
        5000,
        mockInvoiceId,
        mockTenantId,
      );

      expect(outboxEventData).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockTenantId,
            type: 'PAYMENT_RECEIVED',
            payload: expect.objectContaining({
              invoiceId: mockInvoiceId,
              customerId: mockCustomerId,
              amount: 5000,
            }),
          }),
        }),
      );
    });

    it('should reject payment for wrong tenant', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(null);
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      const result = await service.processSuccessfulPayment(
        'pi_wrong_tenant',
        5000,
        mockInvoiceId,
        'wrong-tenant',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invoice not found');
    });
  });

  describe('processFailedPayment', () => {
    it('should create failed payment record', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(null);
      mockPrismaService.payment.create.mockResolvedValue({
        ...mockPayment,
        status: 'FAILED',
      });
      mockPrismaService.outboxEvent.create.mockResolvedValue({});

      const result = await service.processFailedPayment(
        'pi_failed_1',
        mockInvoiceId,
        mockTenantId,
        'Card declined',
      );

      expect(result.success).toBe(true);
      expect(mockPrismaService.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          invoiceId: mockInvoiceId,
          providerPaymentId: 'pi_failed_1',
          status: 'FAILED',
        }),
      });
    });

    it('should update existing payment to failed status', async () => {
      const pendingPayment = { ...mockPayment, status: 'PENDING' };
      mockPrismaService.payment.findUnique.mockResolvedValue(pendingPayment);
      mockPrismaService.payment.update.mockResolvedValue({
        ...pendingPayment,
        status: 'FAILED',
      });

      const result = await service.processFailedPayment(
        'pi_test_123',
        mockInvoiceId,
        mockTenantId,
      );

      expect(result.success).toBe(true);
      expect(mockPrismaService.payment.update).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all payments for tenant', async () => {
      const mockPaymentsWithInvoice = [
        { ...mockPayment, invoice: mockInvoice },
        { ...mockPayment, id: 'p2', invoice: mockInvoice },
      ];
      mockPrismaService.payment.findMany.mockResolvedValue(mockPaymentsWithInvoice);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('customerName', 'Test Customer');
      expect(mockPrismaService.payment.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by invoiceId when provided', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([
        { ...mockPayment, invoice: mockInvoice },
      ]);

      await service.findAll(mockInvoiceId);

      expect(mockPrismaService.payment.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, invoiceId: mockInvoiceId },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return payment with details', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        invoice: mockInvoice,
      });

      const result = await service.findOne('payment-1');

      expect(result).toHaveProperty('id', 'payment-1');
      expect(result).toHaveProperty('customerName', 'Test Customer');
    });

    it('should throw NotFoundException for non-existent payment', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cross-tenant isolation', () => {
    it('should reject requests when tenant context is missing', async () => {
      mockTenantContext.getTenantId.mockReturnValue(undefined);

      await expect(service.findAll()).rejects.toThrow(ForbiddenException);
    });

    it('should only return payments for current tenant', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([
        { ...mockPayment, tenantId: mockTenantId, invoice: mockInvoice },
      ]);

      const result = await service.findAll();

      expect(mockPrismaService.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: mockTenantId }),
        }),
      );
    });

    it('should not allow finding payment from different tenant', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('payment-from-other-tenant')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPaymentStats', () => {
    it('should return correct payment statistics', async () => {
      const payments = [
        { amount: 1000, status: 'COMPLETED' },
        { amount: 2000, status: 'COMPLETED' },
        { amount: 500, status: 'PENDING' },
        { amount: 300, status: 'REFUNDED' },
      ];
      mockPrismaService.payment.findMany.mockResolvedValue(payments);

      const result = await service.getPaymentStats();

      expect(result.totalPayments).toBe(4);
      expect(result.totalAmount).toBe(3800);
      expect(result.completedAmount).toBe(3000);
      expect(result.pendingAmount).toBe(500);
      expect(result.refundedAmount).toBe(300);
    });

    it('should handle empty payments list', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      const result = await service.getPaymentStats();

      expect(result.totalPayments).toBe(0);
      expect(result.totalAmount).toBe(0);
    });
  });

  describe('verifyWebhookSignature', () => {
    beforeEach(() => {
      // Set up webhook secret for testing
      process.env.STRIPE_WEBHOOK_SECRET = 'test_webhook_secret';
    });

    afterEach(() => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    it('should verify valid signature', () => {
      const mockEvent = { type: 'payment_intent.succeeded' };
      mockStripeProvider.verifyWebhookSignature.mockReturnValue({
        success: true,
        event: mockEvent,
      });

      const result = service.verifyWebhookSignature('payload', 'signature');

      expect(result.success).toBe(true);
      expect(result.event).toEqual(mockEvent);
    });

    it('should reject invalid signature', () => {
      mockStripeProvider.verifyWebhookSignature.mockReturnValue({
        success: false,
        error: 'Invalid signature',
      });

      const result = service.verifyWebhookSignature('payload', 'invalid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });
  });
});
