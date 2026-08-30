import { performance } from 'node:perf_hooks';
import { DashboardService } from '../dashboard.service';

describe('Dashboard balance performance', () => {
  it('uses one aggregate query and stays below the 300ms target', async () => {
    const query = jest.fn().mockResolvedValue([{ outstanding: 10000, overdue: 2000, paidThisMonth: 5000 }]);
    const service = new DashboardService({ $queryRaw: query } as any, { getTenantId: () => 'tenant-10k' } as any);
    const start = performance.now();
    await service.getBalance();
    expect(performance.now() - start).toBeLessThan(300);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
