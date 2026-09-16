import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';

function escapeCsv(value: string): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rangeFilter(range: string) {
  const now = new Date();
  switch (range) {
    case 'last_30d': {
      const d = new Date(); d.setDate(d.getDate() - 30);
      return d;
    }
    case 'this_quarter': {
      const m = now.getMonth();
      const quarterMonth = Math.floor(m / 3) * 3;
      return new Date(now.getFullYear(), quarterMonth, 1);
    }
    case 'ytd': {
      return new Date(now.getFullYear(), 0, 1);
    }
    case 'all':
      return new Date(0);
    case 'this_month':
    default: {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService) {}

  private getTenantId(): string {
    const tenantId = this.context.getTenantId();
    if (!tenantId) throw new ForbiddenException('Tenant context not available');
    return tenantId;
  }

  async revenue(range: string) {
    const tenantId = this.getTenantId();
    const from = rangeFilter(range);
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'PAID', createdAt: { gte: from } },
      include: { customer: true },
    });
    const totalCents = invoices.reduce((s, i) => s + i.totalCents, 0);
    const byMonth = new Map<string, number>();
    for (const i of invoices) {
      const key = i.createdAt.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + i.totalCents);
    }
    const byCustomer = new Map<string, { name: string; amountCents: number }>();
    for (const i of invoices) {
      const id = i.customerId;
      const existing = byCustomer.get(id);
      if (existing) {
        existing.amountCents += i.totalCents;
      } else {
        byCustomer.set(id, { name: i.customer.name, amountCents: i.totalCents });
      }
    }
    return {
      total_cents: totalCents,
      by_month: Array.from(byMonth.entries()).map(([month, amount_cents]) => ({ month, amount_cents })).sort((a, b) => a.month.localeCompare(b.month)),
      by_customer: Array.from(byCustomer.entries()).map(([id, { name, amountCents }]) => ({ customer_id: id, name, amount_cents: amountCents })).sort((a: any, b: any) => b.amount_cents - a.amount_cents),
    };
  }

  async revenueCSV(range: string): Promise<string> {
    const data = await this.revenue(range);
    const headers = ['customer_name', 'amount_cents'];
    const lines = [headers.join(',')];
    for (const item of data.by_customer as any[]) {
      lines.push(`${escapeCsv(item.name)},${item.amount_cents}`);
    }
    return lines.join('\r\n');
  }

  async outstanding(range: string) {
    const tenantId = this.getTenantId();
    const from = rangeFilter(range);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'OVERDUE'] },
        createdAt: { gte: from },
      },
      include: { customer: true },
    });
    const totalCents = invoices.reduce((s, i) => s + i.totalCents, 0);
    return {
      total_cents: totalCents,
      by_customer: invoices.map(i => ({ customer_id: i.customerId, name: i.customer.name, outstanding_cents: i.totalCents })),
      invoices: invoices.map(i => ({ id: i.id, number: i.id.substring(0, 8), customer_name: i.customer.name, status: i.status, due_date: i.dueDate.toISOString().split('T')[0], total_cents: i.totalCents })),
    };
  }

  async outstandingCSV(range: string): Promise<string> {
    const data = await this.outstanding(range) as any;
    const headers = ['invoice_number', 'customer_name', 'status', 'due_date', 'total_cents'];
    const lines = [headers.join(',')];
    for (const item of data.invoices) {
      lines.push(`${escapeCsv(item.number)},${escapeCsv(item.customer_name)},${escapeCsv(item.status)},${escapeCsv(item.due_date)},${item.total_cents}`);
    }
    return lines.join('\r\n');
  }

  async aging() {
    const tenantId = this.getTenantId();
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['SENT', 'OVERDUE'] } },
      include: { customer: true },
    });
    const buckets = { current: { count: 0, total_cents: 0 }, '1_30': { count: 0, total_cents: 0 }, '31_60': { count: 0, total_cents: 0 }, '61_90': { count: 0, total_cents: 0 }, '90_plus': { count: 0, total_cents: 0 } };
    const overdueInvoices: any[] = [];
    for (const inv of invoices) {
      const due = new Date(inv.dueDate);
      const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86400000);
      if (daysOverdue < 0) {
        buckets.current.count++;
        buckets.current.total_cents += inv.totalCents;
      } else if (daysOverdue <= 30) {
        buckets['1_30'].count++;
        buckets['1_30'].total_cents += inv.totalCents;
      } else if (daysOverdue <= 60) {
        buckets['31_60'].count++;
        buckets['31_60'].total_cents += inv.totalCents;
      } else if (daysOverdue <= 90) {
        buckets['61_90'].count++;
        buckets['61_90'].total_cents += inv.totalCents;
      } else {
        buckets['90_plus'].count++;
        buckets['90_plus'].total_cents += inv.totalCents;
      }
      if (daysOverdue > 0) {
        overdueInvoices.push({
          id: inv.id,
          number: inv.id.substring(0, 8),
          customer_name: inv.customer.name,
          due_date: inv.dueDate.toISOString().split('T')[0],
          days_overdue: daysOverdue,
          total_cents: inv.totalCents,
          bucket: daysOverdue <= 30 ? '1_30' : daysOverdue <= 60 ? '31_60' : daysOverdue <= 90 ? '61_90' : '90_plus',
        });
      }
    }
    return {
      buckets,
      overdue_invoices: overdueInvoices,
    };
  }

  async agingCSV(): Promise<string> {
    const data = await this.aging();
    const headers = ['bucket', 'count', 'total_cents'];
    const lines = [headers.join(',')];
    for (const [key, val] of Object.entries(data.buckets) as [string, any][]) {
      lines.push(`${escapeCsv(key)},${val.count},${val.total_cents}`);
    }
    return lines.join('\r\n');
  }

  async customers(range: string) {
    const tenantId = this.getTenantId();
    const from = rangeFilter(range);
    const customers = await this.prisma.customer.findMany({
      where: { tenantId },
      include: { invoices: true },
    });
    const result = customers.map(c => {
      const invoices = c.invoices.filter(i => {
        if (range === 'all') return true;
        return i.createdAt >= from;
      });
      const totalBilledCents = invoices.reduce((s, i) => {
        if (['PAID', 'SENT', 'OVERDUE'].includes(i.status)) return s + i.totalCents;
        return s;
      }, 0);
      const totalPaidCents = invoices.reduce((s, i) => {
        if (i.status === 'PAID') return s + i.totalCents;
        return s;
      }, 0);
      const outstandingCents = invoices.reduce((s, i) => {
        if (['SENT', 'OVERDUE'].includes(i.status)) return s + i.totalCents;
        return s;
      }, 0);
      return {
        customer_id: c.id,
        name: c.name,
        total_billed_cents: totalBilledCents,
        total_paid_cents: totalPaidCents,
        outstanding_cents: outstandingCents,
        invoice_count: invoices.length,
      };
    });
    result.sort((a: any, b: any) => b.total_billed_cents - a.total_billed_cents);
    return result;
  }

  async customersCSV(range: string): Promise<string> {
    const data = await this.customers(range) as any[];
    const headers = ['customer_id', 'name', 'total_billed_cents', 'total_paid_cents', 'outstanding_cents', 'invoice_count'];
    const lines = [headers.join(',')];
    for (const item of data) {
      lines.push(`${escapeCsv(item.customer_id)},${escapeCsv(item.name)},${item.total_billed_cents},${item.total_paid_cents},${item.outstanding_cents},${item.invoice_count}`);
    }
    return lines.join('\r\n');
  }
}
