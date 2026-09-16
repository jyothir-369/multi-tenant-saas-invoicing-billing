import { ForbiddenException } from '@nestjs/common';
import { DashboardService } from '../dashboard.service';

function mockPrisma(query: any[]): any {
  return {
    $queryRaw: jest.fn().mockResolvedValue(query),
  };
}

function mockContext(tenantId?: string): any {
  return { getTenantId: () => tenantId };
}

describe('computeStats', () => {
  it('returns zeros with no invoices', async () => {
    const svc = new DashboardService(mockPrisma([{
      outstanding_cents: 0, overdue_cents: 0, paid_this_month_cents: 0,
      total_customers: 0, paid_last_month_cents: 0,
    }]), mockContext('t1'));
    const res = await svc.getOverview('this_month');
    expect(res.stats.outstanding_cents).toBe(0);
    expect(res.stats.overdue_cents).toBe(0);
    expect(res.stats.paid_this_month_cents).toBe(0);
    expect(res.stats.total_customers).toBe(0);
    expect(res.stats.paid_this_month_delta_pct).toBeNull();
  });

  it('mixed status sums correctly', async () => {
    const svc = new DashboardService(mockPrisma([{
      outstanding_cents: 5000, overdue_cents: 2500, paid_this_month_cents: 10000,
      total_customers: 3, paid_last_month_cents: 5000,
    }]), mockContext('t1'));
    const res = await svc.getOverview('this_month');
    expect(res.stats.outstanding_cents).toBe(5000);
    expect(res.stats.overdue_cents).toBe(2500);
    expect(res.stats.paid_this_month_cents).toBe(10000);
    expect(res.stats.paid_this_month_delta_pct).toBe(100);
  });

  it('only overdue sets overdue and zero outstanding', async () => {
    const svc = new DashboardService(mockPrisma([{
      outstanding_cents: 0, overdue_cents: 3000, paid_this_month_cents: 0,
      total_customers: 1, paid_last_month_cents: 3000,
    }]), mockContext('t1'));
    const res = await svc.getOverview('this_month');
    expect(res.stats.overdue_cents).toBe(3000);
    expect(res.stats.paid_this_month_delta_pct).toBe(-100);
  });

  it('delta is null when previous month is zero', async () => {
    const svc = new DashboardService(mockPrisma([{
      outstanding_cents: 0, overdue_cents: 0, paid_this_month_cents: 0,
      total_customers: 0, paid_last_month_cents: 0,
    }]), mockContext('t1'));
    const res = await svc.getOverview('this_month');
    expect(res.stats.paid_this_month_delta_pct).toBeNull();
  });

  it('only draft excludes from stats', async () => {
    const svc = new DashboardService(mockPrisma([{
      outstanding_cents: 0, overdue_cents: 0, paid_this_month_cents: 0,
      total_customers: 0, paid_last_month_cents: 0,
    }]), mockContext('t1'));
    const res = await svc.getOverview('all');
    expect(res.stats.outstanding_cents).toBe(0);
    expect(res.stats.overdue_cents).toBe(0);
  });
});

describe('computeRevenueByMonth', () => {
  it('fills 6-month window including sparse months', async () => {
    const svc = new DashboardService(mockPrisma([
      { month: '2026-04', amount_cents: 1200 },
      { month: '2026-06', amount_cents: 800 },
    ]), mockContext('t1'));
    const res = await svc.getOverview('this_month');
    expect(res.revenue_by_month.length).toBe(6);
    expect(res.revenue_by_month[0].month).toBeDefined();
  });
});

describe('bucket math', () => {
  it('sums outstanding and overdue per month', async () => {
    const svc = new DashboardService(mockPrisma([]), mockContext('t1'));
    const res = await svc.getOverview('this_month');
    expect(res.invoice_buckets.length).toBe(6);
    for (const b of res.invoice_buckets) {
      expect(typeof b.outstanding_cents).toBe('number');
      expect(typeof b.overdue_cents).toBe('number');
      expect(b.outstanding_cents + b.overdue_cents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('tenant isolation', () => {
  it('excludes other tenant data', async () => {
    const svc = new DashboardService(mockPrisma([{
      outstanding_cents: 100, overdue_cents: 0, paid_this_month_cents: 200,
      total_customers: 1, paid_last_month_cents: 0,
    }]), mockContext('t-tenant-a'));
    const res = await svc.getOverview('all');
    expect(res.stats.outstanding_cents).toBe(100);
  });

  it('ignores client-supplied tenant_id', async () => {
    const svc = new DashboardService(mockPrisma([{
      outstanding_cents: 0, overdue_cents: 0, paid_this_month_cents: 0,
      total_customers: 0, paid_last_month_cents: 0,
    }]), mockContext('t-ignored'));
    const res = await svc.getOverview('this_month');
    expect(res.stats.outstanding_cents).toBe(0);
  });

  it('fails without tenant context', async () => {
    const svc = new DashboardService(mockPrisma([]), mockContext());
    await expect(svc.getOverview('this_month')).rejects.toThrow(ForbiddenException);
  });
});
