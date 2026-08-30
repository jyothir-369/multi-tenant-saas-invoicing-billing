import { Test, TestingModule } from '@nestjs/testing';
import { CustomersController } from '../customers.controller';
import { CustomersService, CustomerWithBalance } from '../customers.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUserData } from '../../auth/decorators/current-user.decorator';

describe('CustomersController', () => {
  let controller: CustomersController;
  let service: CustomersService;

  const mockUser: CurrentUserData = {
    id: 'user-1',
    email: 'test@example.com',
    tenantId: 'tenant-1',
    role: 'OWNER' as any,
  };

  const mockCustomer: CustomerWithBalance = {
    id: 'customer-1',
    tenantId: 'tenant-1',
    name: 'Test Customer',
    email: 'test@example.com',
    isArchived: false,
    balance: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [{ provide: CustomersService, useValue: mockCustomersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CustomersController>(CustomersController);
    service = module.get<CustomersService>(CustomersService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a customer', async () => {
      const dto = { name: 'Test Customer', email: 'test@example.com' };
      mockCustomersService.create.mockResolvedValue(mockCustomer);

      const result = await controller.create(dto, mockUser);

      expect(result).toEqual(mockCustomer);
      expect(mockCustomersService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return all non-archived customers', async () => {
      mockCustomersService.findAll.mockResolvedValue([mockCustomer]);

      const result = await controller.findAll(undefined);

      expect(result).toEqual([mockCustomer]);
      expect(mockCustomersService.findAll).toHaveBeenCalledWith(false);
    });

    it('should include archived when query param is true', async () => {
      mockCustomersService.findAll.mockResolvedValue([mockCustomer]);

      await controller.findAll('true');

      expect(mockCustomersService.findAll).toHaveBeenCalledWith(true);
    });
  });

  describe('findOne', () => {
    it('should return a customer by id', async () => {
      mockCustomersService.findOne.mockResolvedValue(mockCustomer);

      const result = await controller.findOne('customer-1');

      expect(result).toEqual(mockCustomer);
      expect(mockCustomersService.findOne).toHaveBeenCalledWith('customer-1');
    });
  });

  describe('update', () => {
    it('should update a customer', async () => {
      const dto = { name: 'Updated Name' };
      const updated = { ...mockCustomer, name: 'Updated Name' };
      mockCustomersService.update.mockResolvedValue(updated);

      const result = await controller.update('customer-1', dto);

      expect(result.name).toBe('Updated Name');
      expect(mockCustomersService.update).toHaveBeenCalledWith('customer-1', dto);
    });
  });

  describe('archive', () => {
    it('should archive a customer', async () => {
      const archived = { ...mockCustomer, isArchived: true };
      mockCustomersService.archive.mockResolvedValue(archived);

      const result = await controller.archive('customer-1');

      expect(result.isArchived).toBe(true);
    });
  });

  describe('unarchive', () => {
    it('should unarchive a customer', async () => {
      const unarchived = { ...mockCustomer, isArchived: false };
      mockCustomersService.unarchive.mockResolvedValue(unarchived);

      const result = await controller.unarchive('customer-1');

      expect(result.isArchived).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a customer', async () => {
      mockCustomersService.delete.mockResolvedValue(undefined);

      await controller.delete('customer-1');

      expect(mockCustomersService.delete).toHaveBeenCalledWith('customer-1');
    });
  });
});
