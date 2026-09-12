import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';

export interface DashboardBalance {
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
}

export interface OverviewStats {
  outstanding_cents: number;
  overdue_cents: number;
  paid_this_month_cents: number;
  total_customers: number;
  paid_this_month_delta_pct: number | null;
}

export interface RevenueByMonth {
  month: string;
  amount_cents: number;
}

export interface InvoiceBucket {
  month: string;
  outstanding_cents: number;
  overdue_cents: number;
}

export interface RecentInvoice {
  id: string;
  invoiceNumber?: string;
  customerName?: string;
  status: string;
  amountCents: number;
  dueDate: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  text: string;
  createdAt: string;
}

export interface OverviewResponse {
  range: string;
  stats: OverviewStats;
  revenue_by_month: RevenueByMonth[];
  invoice_buckets: InvoiceBucket[];
  recent_invoices: RecentInvoice[];
  recent_activity: ActivityEvent[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService) {}

  private getTenantId(): string {
    const id = this.context.getTenantId();
    if (!id) throw new ForbiddenException('Tenant context not available');
    return id;
  }

  async getOverview(range: string): Promise<OverviewResponse> {
    const tenantId = this.getTenantId();
    const now = new Date();

    // Date range bounds
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    let rangeStart = new Date(1970, 0, 1);
    if (range === 'this_month') rangeStart = startOfMonth;
    else if (range === 'last_30d') rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (range === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      rangeStart = new Date(now.getFullYear(), q * 3, 1);
    } else if (range === 'ytd') rangeStart = new Date(now.getFullYear(), 0, 1);

    // Aggregate stats (integer cents)
    const statsQuery = await this.prisma.$queryRaw<Array<{
      outstanding_cents: number | bigint;
      overdue_cents: number | bigint;
      paid_this_month_cents: number | bigint;
      total_customers: number | bigint;
      paid_last_month_cents: number | bigint;
    }>>`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('SENT', 'OVERDUE') THEN total_cents ELSE 0 END), 0)::int AS outstanding_cents,
        COALESCE(SUM(CASE WHEN status = 'OVERDUE' AND due_date < NOW() THEN total_cents ELSE 0 END), 0)::int AS overdue_cents,
        COALESCE(SUM(CASE WHEN status = 'PAID' AND paid_at >= ${startOfMonth} AND paid_at < ${new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1)} THEN total_cents ELSE 0 END), 0)::int AS paid_this_month_cents,
        (SELECT COUNT(*)::int FROM customers WHERE tenant_id = ${tenantId} AND is_archived = false) AS total_customers,
        COALESCE(SUM(CASE WHEN status = 'PAID' AND paid_at >= ${startOfLastMonth} AND paid_at < ${startOfMonth} THEN total_cents ELSE 0 END), 0)::int AS paid_last_month_cents
      FROM invoices
      WHERE tenant_id = ${tenantId}
    `;
    const statsRow = statsQuery[0] ?? {
      outstanding_cents: 0,
      overdue_cents: 0,
      paid_this_month_cents: 0,
      total_customers: 0,
      paid_last_month_cents: 0,
    };

    const paidThisMonth = Number(statsRow.paid_this_month_cents ?? 0);
    const paidLastMonth = Number(statsRow.paid_last_month_cents ?? 0);
    const deltaPct = paidLastMonth === 0 ? null : Math.round(((paidThisMonth - paidLastMonth) / paidLastMonth) * 100);

    // Last 6 month labels to fill sparse series
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // Revenue by month (paid only, last 6 months)
    const revenueRows = await this.prisma.$queryRaw<Array<{ month: string; amount_cents: number | bigint }>>`
      SELECT
        TO_CHAR(paid_at, 'YYYY-MM') AS month,
        SUM(total_cents)::int AS amount_cents
      FROM invoices
      WHERE tenant_id = ${tenantId} AND status = 'PAID'
        AND paid_at >= ${new Date(now.getFullYear(), now.getMonth() - 5, 1)}
        AND paid_at < ${new Date(now.getFullYear(), now.getMonth() + 1, 1)}
      GROUP BY TO_CHAR(paid_at, 'YYYY-MM')
      ORDER BY month ASC
    `;
    const revenueByMonth: RevenueByMonth[] = revenueRows.map((r) => ({
      month: String(r.month),
      amount_cents: Number(r.amount_cents ?? 0),
    }));
    const revFilled: RevenueByMonth[] = months.map((m) => {
      const found = revenueByMonth.find((r) => r.month === m);
      return found ?? { month: m, amount_cents: 0 };
    });

    // Invoice buckets by due month (last 6 months)
    const bucketRows = await this.prisma.$queryRaw<Array<{ month: string; outstanding_cents: number | bigint; overdue_cents: number | bigint }>>`
      SELECT
        TO_CHAR(due_date, 'YYYY-MM') AS month,
        SUM(CASE WHEN status IN ('SENT', 'OVERDUE') THEN total_cents ELSE 0 END)::int AS outstanding_cents,
        SUM(CASE WHEN status = 'OVERDUE' AND due_date < NOW() THEN total_cents ELSE 0 END)::int AS overdue_cents
      FROM invoices
      WHERE tenant_id = ${tenantId}
        AND due_date >= ${new Date(now.getFullYear(), now.getMonth() - 5, 1)}
        AND due_date < ${new Date(now.getFullYear(), now.getMonth() + 1, 1)}
      GROUP BY TO_CHAR(due_date, 'YYYY-MM')
      ORDER BY month ASC
    `;
    const buckets: InvoiceBucket[] = months.map((m) => {
      const found = bucketRows.find((b) => b.month === m);
      return found
        ? { month: m, outstanding_cents: Number(found.outstanding_cents ?? 0), overdue_cents: Number(found.overdue_cents ?? 0) }
        : { month: m, outstanding_cents: 0, overdue_cents: 0 };
    });

    // Recent invoices (5, tenant-scoped)
    const recentInvoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } },
    });
    const recentInvoicesMapped: RecentInvoice[] = recentInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: (inv as unknown as Record<string, unknown>).invoiceNumber as string | undefined ?? `INV-${inv.id.slice(0, 6).toUpperCase()}`,
      customerName: inv.customer?.name ?? 'Unknown',
      status: inv.status,
      amountCents: inv.totalCents,
      dueDate: inv.dueDate.toISOString(),
    }));

    // Recent activity: outbox events + invoice creations, newest first (5)
    const events = await this.prisma.$queryRaw<Array<{ id: string; type: string; text: string; created_at: Date }>>`
      SELECT id, type, payload->>'text' AS text, "createdAt" AS created_at FROM outbox_events
      WHERE tenant_id = ${tenantId}
      ORDER BY "createdAt" DESC
      LIMIT 5
    `;
    const eventsMapped: ActivityEvent[] = events.map((e) => ({
      id: String(e.id),
      type: String(e.type),
      text: String(e.text ?? 'Activity'),
      createdAt: new Date(e.created_at).toISOString(),
    }));
    const invoiceCreates = await this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(0, 5 - eventsMapped.length),
      select: { id: true, customer: { select: { name: true } }, status: true, createdAt: true },
    });
    const invoiceEvents: ActivityEvent[] = invoiceCreates.map((inv) => ({
      id: inv.id,
      type: 'invoice_created',
      text: `Invoice created for ${inv.customer?.name ?? 'customer'}`,
      createdAt: inv.createdAt.toISOString(),
    }));
    const fullActivity = [...eventsMapped, ...invoiceEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

    return {
      range,
      stats: {
        outstanding_cents: Number(statsRow.outstanding_cents ?? 0),
        overdue_cents: Number(statsRow.overdue_cents ?? 0),
        paid_this_month_cents: paidThisMonth,
        total_customers: Number(statsRow.total_customers ?? 0),
        paid_this_month_delta_pct: deltaPct,
      },
      revenue_by_month: revFilled,
      invoice_buckets: buckets,
      recent_invoices: recentInvoicesMapped,
      recent_activity: fullActivity,
    };
  }

  async getBalance(): Promise<DashboardBalance> {
    const tenantId = this.getTenantId();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const rows = await this.prisma.$queryRaw<Array<{ outstanding: bigint | number; overdue: bigint | number; paidThisMonth: bigint | number }>>`
      SELECT
        COALESCE(SUM(CASE WHEN i.status = 'SENT' AND i.due_date >= NOW() THEN i.total_cents - COALESCE(p.paid, 0) ELSE 0 END), 0) AS outstanding,
        COALESCE(SUM(CASE WHEN (i.status = 'OVERDUE' OR (i.status = 'SENT' AND i.due_date < NOW())) THEN i.total_cents - COALESCE(p.paid, 0) ELSE 0 END), 0) AS overdue,
        COALESCE((SELECT SUM(amount) FROM payments WHERE tenant_id = ${tenantId} AND status = 'COMPLETED' AND "createdAt" >= ${startOfMonth}), 0) AS "paidThisMonth"
      FROM invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS paid FROM payments
        WHERE tenant_id = ${tenantId} AND status = 'COMPLETED'
        GROUP BY invoice_id
      ) p ON p.invoice_id = i.id
      WHERE i.tenant_id = ${tenantId} AND i.status IN ('SENT', 'OVERDUE')
    `;
    const row = rows[0] ?? { outstanding: 0, overdue: 0, paidThisMonth: 0 };
    return { outstanding: Number(row.outstanding), overdue: Number(row.overdue), paidThisMonth: Number(row.paidThisMonth) };
  }
}