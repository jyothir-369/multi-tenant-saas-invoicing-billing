import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantsService } from '../tenants.service';

describe('TenantsService', () => {
  const tenantId = 'tenant-1';
  const prisma: any = {
    tenant: { findUnique: jest.fn(), update: jest.fn() },
    user: { count: jest.fn() }, customer: { count: jest.fn() },
    invoice: { count: jest.fn(), findMany: jest.fn() },
    payment: { count: jest.fn(), findMany: jest.fn() },
  };
  const context = { getTenantId: jest.fn(() => tenantId) };
  let service: TenantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    context.getTenantId.mockReturnValue(tenantId);
    service = new TenantsService(prisma, context as any);
  });

  it('returns only the authenticated tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: tenantId, name: 'Acme', plan: 'free' });
    await expect(service.findOne(tenantId)).resolves.toEqual(expect.objectContaining({ id: tenantId }));
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { id: tenantId } });
  });

  it('denies cross-tenant reads and writes', async () => {
    await expect(service.findOne('tenant-2')).rejects.toThrow(ForbiddenException);
    await expect(service.update({ name: 'Other' }, 'tenant-2')).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when tenant context is missing', async () => {
    context.getTenantId.mockReturnValue(undefined);
    await expect(service.getStats()).rejects.toThrow(ForbiddenException);
  });

  it('updates only permitted tenant fields', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: tenantId, name: 'Old', plan: 'free' });
    prisma.tenant.update.mockResolvedValue({ id: tenantId, name: 'New', plan: 'starter' });
    await service.update({ name: '  New  ', plan: 'starter' }, tenantId);
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId }, data: { name: 'New', plan: 'starter' },
    });
  });

  it('returns not found for a missing tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(service.findOne()).rejects.toThrow(NotFoundException);
  });
});
