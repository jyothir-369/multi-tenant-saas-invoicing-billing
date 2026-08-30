import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CustomersService, CustomerWithBalance } from '../customers.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/tenant-context.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let prismaService: PrismaService;
  let tenantContext: TenantContextService;

  const mockTenantId = 'tenant-1';

  const mockPrismaService = {
    customer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
    },
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantId),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContextService, useValue: mockTenantContext },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
    prismaService = module.get<PrismaService>(PrismaService);
    tenantContext = module.get<TenantContextService>(TenantContextService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new customer', async () => {
      const dto = { name: 'Test Customer', email: 'test@example.com' };
      const expectedCustomer = {
        id: 'customer-1',
        tenantId: mockTenantId,
        ...dto,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.customer.create.mockResolvedValue(expectedCustomer);

      const result = await service.create(dto);

      expect(result).toHaveProperty('id', 'customer-1');
      expect(result).toHaveProperty('name', 'Test Customer');
      expect(result).toHaveProperty('balance', 0);
      expect(mockPrismaService.customer.create).toHaveBeenCalledWith({
        data: { name: 'Test Customer', email: 'test@example.com', tenantId: mockTenantId },
      });
    });
  });

  describe('findAll', () => {
    it('should return all non-archived customers with balances', async () => {
      const mockCustomers = [
        { id: 'customer-1', name: 'Customer 1', email: 'c1@test.com', isArchived: false, tenantId: mockTenantId },
        { id: 'customer-2', name: 'Customer 2', email: 'c2@test.com', isArchived: false, tenantId: mockTenantId },
      ];

      mockPrismaService.customer.findMany.mockResolvedValue(mockCustomers);
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('balance', 0);
      expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, isArchived: false },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should include archived customers when includeArchived is true', async () => {
      mockPrismaService.customer.findMany.mockResolvedValue([]);
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      await service.findAll(true);

      expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a customer with balance', async () => {
      const mockCustomer = {
        id: 'customer-1',
        name: 'Test Customer',
        email: 'test@example.com',
        isArchived: false,
        tenantId: mockTenantId,
      };

      mockPrismaService.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      const result = await service.findOne('customer-1');

      expect(result).toHaveProperty('id', 'customer-1');
      expect(result).toHaveProperty('balance', 0);
    });

    it('should throw NotFoundException if customer not found', async () => {
      mockPrismaService.customer.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a customer', async () => {
      const existingCustomer = {
        id: 'customer-1',
        name: 'Old Name',
        email: 'old@test.com',
        isArchived: false,
        tenantId: mockTenantId,
      };

      const updatedCustomer = {
        ...existingCustomer,
        name: 'New Name',
      };

      mockPrismaService.customer.findFirst.mockResolvedValue(existingCustomer);
      mockPrismaService.customer.update.mockResolvedValue(updatedCustomer);
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      const result = await service.update('customer-1', { name: 'New Name' });

      expect(result).toHaveProperty('name', 'New Name');
    });

    it('should throw NotFoundException if customer not found', async () => {
      mockPrismaService.customer.findFirst.mockResolvedValue(null);

      await expect(service.update('non-existent', { name: 'New' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('should archive a customer', async () => {
      const customer = { id: 'customer-1', name: 'Test', email: 'test@test.com', isArchived: false, tenantId: mockTenantId };
      mockPrismaService.customer.findFirst.mockResolvedValue(customer);
      mockPrismaService.customer.update.mockResolvedValue({ ...customer, isArchived: true });
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      const result = await service.archive('customer-1');

      expect(result).toHaveProperty('isArchived', true);
    });
  });

  describe('delete', () => {
    it('should delete a customer', async () => {
      const customer = { id: 'customer-1', name: 'Test', email: 'test@test.com', isArchived: false, tenantId: mockTenantId };
      mockPrismaService.customer.findFirst.mockResolvedValue(customer);
      mockPrismaService.customer.delete.mockResolvedValue(customer);

      await service.delete('customer-1');

      expect(mockPrismaService.customer.delete).toHaveBeenCalledWith({ where: { id: 'customer-1' } });
    });

    it('should throw NotFoundException if customer not found', async () => {
      mockPrismaService.customer.findFirst.mockResolvedValue(null);

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('calculateBalance', () => {
    it('should calculate correct balance from invoices and payments', async () => {
      const customerId = 'customer-1';
      const invoices = [
        { id: 'inv-1', amount: 1000, status: 'SENT' },
        { id: 'inv-2', amount: 2000, status: 'OVERDUE' },
      ];
      const payments = [{ id: 'pay-1', amount: 500, invoiceId: 'inv-1', status: 'COMPLETED' }];

      mockPrismaService.customer.findFirst.mockResolvedValue({
        id: customerId,
        name: 'Test Customer',
        email: 'test@example.com',
        isArchived: false,
        tenantId: mockTenantId,
      });
      mockPrismaService.invoice.findMany.mockResolvedValue(invoices);
      mockPrismaService.payment.findMany.mockResolvedValue(payments);

      const result = await service.findOne(customerId);

      expect(result.balance).toBe(2500);
    });

    it('should return 0 balance when no invoices', async () => {
      mockPrismaService.customer.findFirst.mockResolvedValue({
        id: 'customer-1',
        name: 'Test',
        email: 'test@test.com',
        isArchived: false,
        tenantId: mockTenantId,
      });
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      const result = await service.findOne('customer-1');

      expect(result.balance).toBe(0);
    });
  });
});

