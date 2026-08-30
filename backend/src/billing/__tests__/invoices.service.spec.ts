import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InvoicesService } from '../invoices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { InvoiceStatus } from '@prisma/client';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prismaService: PrismaService;
  let tenantContext: TenantContextService;

  const mockTenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';

  let mockPrismaService: any;
  let mockTenantContext: any;

  beforeEach(async () => {
    mockPrismaService = {
      invoice: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
      },
      payment: {
        findMany: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
    };

    mockTenantContext = {
      getTenantId: jest.fn().mockReturnValue(mockTenantId),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContextService, useValue: mockTenantContext },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    prismaService = module.get<PrismaService>(PrismaService);
    tenantContext = module.get<TenantContextService>(TenantContextService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an invoice', async () => {
      const dto = {
        customerId: 'customer-1',
        amount: 100000,
        dueDate: '2024-12-31T23:59:59Z',
      };

      const mockCustomer = {
        id: 'customer-1',
        tenantId: mockTenantId,
        name: 'Test Customer',
        email: 'test@example.com',
        isArchived: false,
      };

      const mockInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(dto.dueDate),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        customer: { name: 'Test Customer', email: 'test@example.com' },
      };

      mockPrismaService.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrismaService.invoice.create.mockResolvedValue(mockInvoice);
      mockPrismaService.$executeRaw.mockResolvedValue({ rowCount: 1 });

      const result = await service.create(dto);

      expect(result).toHaveProperty('id', 'invoice-1');
      expect(result).toHaveProperty('status', InvoiceStatus.DRAFT);
      expect(result.customerName).toBe('Test Customer');
    });

    it('should throw NotFoundException for non-existent customer', async () => {
      const dto = {
        customerId: 'non-existent',
        amount: 100000,
        dueDate: '2024-12-31T23:59:59Z',
      };

      mockPrismaService.customer.findFirst.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for archived customer', async () => {
      const dto = {
        customerId: 'customer-1',
        amount: 100000,
        dueDate: '2024-12-31T23:59:59Z',
      };

      mockPrismaService.customer.findFirst.mockResolvedValue({
        id: 'customer-1',
        tenantId: mockTenantId,
        isArchived: true,
      });

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should create a recurring invoice', async () => {
      const dto = {
        customerId: 'customer-1',
        amount: 100000,
        dueDate: '2024-12-31T23:59:59Z',
        recurrenceRule: '30 days',
      };

      const mockCustomer = {
        id: 'customer-1',
        tenantId: mockTenantId,
        name: 'Test Customer',
        email: 'test@example.com',
        isArchived: false,
      };

      const mockInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(dto.dueDate),
        recurrenceRule: '30 days',
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        customer: { name: 'Test Customer', email: 'test@example.com' },
      };

      mockPrismaService.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrismaService.invoice.create.mockResolvedValue(mockInvoice);
      mockPrismaService.$executeRaw.mockResolvedValue({ rowCount: 1 });

      const result = await service.create(dto);

      expect(result.recurrenceRule).toBe('30 days');
    });
  });

  describe('findOne', () => {
    it('should return an invoice with balance', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.SENT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        customer: { name: 'Test Customer', email: 'test@example.com' },
        payments: [{ id: 'payment-1', amount: 50000 }],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);

      const result = await service.findOne('invoice-1');

      expect(result).toHaveProperty('id', 'invoice-1');
      expect(result.balance).toBe(50000);
    });

    it('should throw NotFoundException if invoice not found', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation - reject other tenant invoice', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne('invoice-other-tenant')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a draft invoice amount', async () => {
      const existingInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedInvoice = {
        ...existingInvoice,
        amount: 150000,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(existingInvoice);
      mockPrismaService.invoice.update.mockResolvedValue(updatedInvoice);

      const result = await service.update('invoice-1', { amount: 150000 });

      expect(result.amount).toBe(150000);
    });

    it('should allow status transition from DRAFT to SENT', async () => {
      const existingInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedInvoice = {
        ...existingInvoice,
        status: InvoiceStatus.SENT,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(existingInvoice);
      mockPrismaService.invoice.update.mockResolvedValue(updatedInvoice);

      const result = await service.update('invoice-1', { status: InvoiceStatus.SENT });

      expect(result.status).toBe(InvoiceStatus.SENT);
    });

    it('should reject invalid status transition from PAID to DRAFT', async () => {
      const existingInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.PAID,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(existingInvoice);

      await expect(
        service.update('invoice-1', { status: InvoiceStatus.DRAFT }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject modifying non-draft invoice amount', async () => {
      const existingInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.SENT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(existingInvoice);

      await expect(
        service.update('invoice-1', { amount: 150000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('send', () => {
    it('should send a draft invoice', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sentInvoice = {
        ...invoice,
        status: InvoiceStatus.SENT,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);
      mockPrismaService.invoice.update.mockResolvedValue(sentInvoice);
      mockPrismaService.outboxEvent.create.mockResolvedValue({});

      const result = await service.send('invoice-1');

      expect(result.status).toBe(InvoiceStatus.SENT);
      expect(mockPrismaService.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_SENT',
          tenantId: mockTenantId,
        }),
      });
    });

    it('should reject sending non-draft invoice', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.SENT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);

      await expect(service.send('invoice-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('markPaid', () => {
    it('should mark sent invoice as paid', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.SENT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const paidInvoice = {
        ...invoice,
        status: InvoiceStatus.PAID,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);
      mockPrismaService.invoice.update.mockResolvedValue(paidInvoice);
      mockPrismaService.outboxEvent.create.mockResolvedValue({});

      const result = await service.markPaid('invoice-1');

      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(mockPrismaService.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_PAID',
          tenantId: mockTenantId,
        }),
      });
    });

    it('should reject marking draft invoice as paid', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);

      await expect(service.markPaid('invoice-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('void', () => {
    it('should void a draft invoice', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const voidedInvoice = {
        ...invoice,
        status: InvoiceStatus.VOID,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);
      mockPrismaService.invoice.update.mockResolvedValue(voidedInvoice);

      const result = await service.void('invoice-1');

      expect(result.status).toBe(InvoiceStatus.VOID);
    });

    it('should void an overdue invoice', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.OVERDUE,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const voidedInvoice = {
        ...invoice,
        status: InvoiceStatus.VOID,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);
      mockPrismaService.invoice.update.mockResolvedValue(voidedInvoice);

      const result = await service.void('invoice-1');

      expect(result.status).toBe(InvoiceStatus.VOID);
    });

    it('should reject voiding a paid invoice', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.PAID,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);

      await expect(service.void('invoice-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete a draft invoice', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);
      mockPrismaService.invoice.delete.mockResolvedValue(invoice);

      await service.delete('invoice-1');

      expect(mockPrismaService.invoice.delete).toHaveBeenCalledWith({ where: { id: 'invoice-1' } });
    });

    it('should reject deleting non-draft invoice', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.SENT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);

      await expect(service.delete('invoice-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDashboardBalance', () => {
    it('should calculate correct dashboard balance', async () => {
      const invoices = [
        {
          id: 'invoice-1',
          tenantId: mockTenantId,
          customerId: 'customer-1',
          status: InvoiceStatus.SENT,
          amount: 100000,
          dueDate: new Date(Date.now() + 86400000),
          payments: [],
        },
        {
          id: 'invoice-2',
          tenantId: mockTenantId,
          customerId: 'customer-1',
          status: InvoiceStatus.OVERDUE,
          amount: 50000,
          dueDate: new Date(Date.now() - 86400000),
          payments: [],
        },
        {
          id: 'invoice-3',
          tenantId: mockTenantId,
          customerId: 'customer-1',
          status: InvoiceStatus.PAID,
          amount: 30000,
          dueDate: new Date(),
          payments: [{ id: 'pay-1', amount: 30000 }],
        },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(invoices);

      const result = await service.getDashboardBalance();

      expect(result.outstanding).toBe(100000);
      expect(result.overdue).toBe(50000);
    });
  });

  describe('cross-tenant isolation', () => {
    it('should not find invoices from other tenants', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne('invoice-other-tenant')).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant context', async () => {
      mockTenantContext.getTenantId.mockReturnValue(undefined);

      await expect(service.getDashboardBalance()).rejects.toThrow(ForbiddenException);
    });

    it('should scope all queries to current tenant', async () => {
      const invoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);

      await service.findOne('invoice-1');

      expect(mockPrismaService.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: 'invoice-1', tenantId: mockTenantId },
        include: expect.any(Object),
      });
    });
  });

  describe('status lifecycle', () => {
    it('should enforce DRAFT -> SENT transition', async () => {
      const existingInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.DRAFT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sentInvoice = {
        ...existingInvoice,
        status: InvoiceStatus.SENT,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(existingInvoice);
      mockPrismaService.invoice.update.mockResolvedValue(sentInvoice);

      const result = await service.update('invoice-1', { status: InvoiceStatus.SENT });
      expect(result.status).toBe(InvoiceStatus.SENT);
    });

    it('should allow SENT -> OVERDUE transition', async () => {
      const existingInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.SENT,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const overdueInvoice = {
        ...existingInvoice,
        status: InvoiceStatus.OVERDUE,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(existingInvoice);
      mockPrismaService.invoice.update.mockResolvedValue(overdueInvoice);

      const result = await service.update('invoice-1', { status: InvoiceStatus.OVERDUE });
      expect(result.status).toBe(InvoiceStatus.OVERDUE);
    });

    it('should allow OVERDUE -> PAID transition', async () => {
      const existingInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.OVERDUE,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const paidInvoice = {
        ...existingInvoice,
        status: InvoiceStatus.PAID,
        customer: { name: 'Test', email: 'test@test.com' },
        payments: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(existingInvoice);
      mockPrismaService.invoice.update.mockResolvedValue(paidInvoice);

      const result = await service.update('invoice-1', { status: InvoiceStatus.PAID });
      expect(result.status).toBe(InvoiceStatus.PAID);
    });

    it('should not allow PAID -> any transition', async () => {
      const existingInvoice = {
        id: 'invoice-1',
        tenantId: mockTenantId,
        customerId: 'customer-1',
        status: InvoiceStatus.PAID,
        amount: 100000,
        dueDate: new Date(),
        recurrenceRule: null,
        lastGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(existingInvoice);

      await expect(
        service.update('invoice-1', { status: InvoiceStatus.DRAFT }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.update('invoice-1', { status: InvoiceStatus.SENT }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.update('invoice-1', { status: InvoiceStatus.OVERDUE }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.update('invoice-1', { status: InvoiceStatus.VOID }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

