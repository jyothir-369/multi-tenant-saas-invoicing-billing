import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesController } from '../invoices.controller';
import { InvoicesService, InvoiceWithDetails } from '../invoices.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUserData } from '../../auth/decorators/current-user.decorator';
import { InvoiceStatus } from '@prisma/client';

describe('InvoicesController', () => {
  let controller: InvoicesController;
  let service: InvoicesService;

  const mockUser: CurrentUserData = {
    id: 'user-1',
    email: 'test@example.com',
    tenantId: 'tenant-1',
    role: 'OWNER' as any,
  };

  const mockInvoice: InvoiceWithDetails = {
    id: 'invoice-1',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    status: InvoiceStatus.DRAFT,
    amount: 100000,
    dueDate: new Date('2024-12-31'),
    recurrenceRule: null,
    lastGeneratedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    balance: 100000,
  };

  const mockInvoicesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    send: jest.fn(),
    markPaid: jest.fn(),
    markOverdue: jest.fn(),
    void: jest.fn(),
    delete: jest.fn(),
    getDashboardBalance: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoicesController],
      providers: [{ provide: InvoicesService, useValue: mockInvoicesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InvoicesController>(InvoicesController);
    service = module.get<InvoicesService>(InvoicesService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an invoice', async () => {
      const dto = {
        customerId: 'customer-1',
        amount: 100000,
        dueDate: '2024-12-31T23:59:59Z',
      };

      mockInvoicesService.create.mockResolvedValue(mockInvoice);

      const result = await controller.create(dto, mockUser);

      expect(result).toEqual(mockInvoice);
      expect(mockInvoicesService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return all invoices', async () => {
      mockInvoicesService.findAll.mockResolvedValue([mockInvoice]);

      const result = await controller.findAll(undefined);

      expect(result).toEqual([mockInvoice]);
      expect(mockInvoicesService.findAll).toHaveBeenCalledWith(undefined);
    });

    it('should filter by status', async () => {
      mockInvoicesService.findAll.mockResolvedValue([mockInvoice]);

      await controller.findAll(InvoiceStatus.SENT);

      expect(mockInvoicesService.findAll).toHaveBeenCalledWith(InvoiceStatus.SENT);
    });
  });

  describe('findOne', () => {
    it('should return an invoice by id', async () => {
      mockInvoicesService.findOne.mockResolvedValue(mockInvoice);

      const result = await controller.findOne('invoice-1');

      expect(result).toEqual(mockInvoice);
      expect(mockInvoicesService.findOne).toHaveBeenCalledWith('invoice-1');
    });
  });

  describe('update', () => {
    it('should update an invoice', async () => {
      const dto = { amount: 150000 };
      const updated = { ...mockInvoice, amount: 150000 };
      mockInvoicesService.update.mockResolvedValue(updated);

      const result = await controller.update('invoice-1', dto);

      expect(result.amount).toBe(150000);
      expect(mockInvoicesService.update).toHaveBeenCalledWith('invoice-1', dto);
    });
  });

  describe('send', () => {
    it('should send an invoice', async () => {
      const sent = { ...mockInvoice, status: InvoiceStatus.SENT };
      mockInvoicesService.send.mockResolvedValue(sent);

      const result = await controller.send('invoice-1');

      expect(result.status).toBe(InvoiceStatus.SENT);
    });
  });

  describe('markPaid', () => {
    it('should mark invoice as paid', async () => {
      const paid = { ...mockInvoice, status: InvoiceStatus.PAID };
      mockInvoicesService.markPaid.mockResolvedValue(paid);

      const result = await controller.markPaid('invoice-1');

      expect(result.status).toBe(InvoiceStatus.PAID);
    });
  });

  describe('markOverdue', () => {
    it('should mark invoice as overdue', async () => {
      const overdue = { ...mockInvoice, status: InvoiceStatus.OVERDUE };
      mockInvoicesService.markOverdue.mockResolvedValue(overdue);

      const result = await controller.markOverdue('invoice-1');

      expect(result.status).toBe(InvoiceStatus.OVERDUE);
    });
  });

  describe('void', () => {
    it('should void an invoice', async () => {
      const voided = { ...mockInvoice, status: InvoiceStatus.VOID };
      mockInvoicesService.void.mockResolvedValue(voided);

      const result = await controller.void('invoice-1');

      expect(result.status).toBe(InvoiceStatus.VOID);
    });
  });

  describe('delete', () => {
    it('should delete an invoice', async () => {
      mockInvoicesService.delete.mockResolvedValue(undefined);

      await controller.delete('invoice-1');

      expect(mockInvoicesService.delete).toHaveBeenCalledWith('invoice-1');
    });
  });

  describe('getDashboardBalance', () => {
    it('should return dashboard balance', async () => {
      const balance = { outstanding: 100000, overdue: 50000, paidThisMonth: 30000 };
      mockInvoicesService.getDashboardBalance.mockResolvedValue(balance);

      const result = await controller.getDashboardBalance(mockUser);

      expect(result).toEqual(balance);
    });
  });
});
