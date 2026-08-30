import { ForbiddenException } from '@nestjs/common';
import { DashboardService } from '../dashboard.service';

describe('DashboardService', () => {
  it('fails closed without tenant context', async () => {
    const service = new DashboardService({ $queryRaw: jest.fn() } as any, { getTenantId: () => undefined } as any);
    await expect(service.getBalance()).rejects.toThrow(ForbiddenException);
  });

  it('returns the tenant-scoped aggregate result', async () => {
    const query = jest.fn().mockResolvedValue([{ outstanding: BigInt(1200), overdue: 300, paidThisMonth: BigInt(4500) }]);
    const service = new DashboardService({ $queryRaw: query } as any, { getTenantId: () => 'tenant-1' } as any);
    await expect(service.getBalance()).resolves.toEqual({ outstanding: 1200, overdue: 300, paidThisMonth: 4500 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('handles an empty aggregate result', async () => {
    const service = new DashboardService({ $queryRaw: jest.fn().mockResolvedValue([]) } as any, { getTenantId: () => 'tenant-1' } as any);
    await expect(service.getBalance()).resolves.toEqual({ outstanding: 0, overdue: 0, paidThisMonth: 0 });
  });
});
