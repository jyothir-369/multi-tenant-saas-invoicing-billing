import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

describe('PrismaService tenant enforcement', () => {
  it('fails closed when no tenant context exists', () => {
    const service: any = Object.create(PrismaService.prototype);
    service.tenantContext = { getTenantId: () => undefined };
    expect(() => service.client).toThrow(ForbiddenException);
  });

  it('overrides create tenant ids and scopes updates', async () => {
    const service: any = Object.create(PrismaService.prototype);
    service.tenantContext = { getTenantId: () => 'tenant-1' };
    let captured: any;
    service.$extends = (extension: any) => {
      captured = extension.query.$allModels.$allOperations;
      return { extension };
    };
    service.client;
    const query = jest.fn((args) => args);
    const createArgs = { data: { tenantId: 'tenant-2', name: 'x' } };
    await captured({ model: 'Customer', operation: 'create', args: createArgs, query });
    expect(createArgs.data.tenantId).toBe('tenant-1');
    const updateArgs = { where: { id: 'c1' }, data: { tenantId: 'tenant-2', name: 'y' } };
    await captured({ model: 'Customer', operation: 'update', args: updateArgs, query });
    expect(updateArgs.where.tenantId).toBe('tenant-1');
    expect(updateArgs.data.tenantId).toBeUndefined();
  });
});
