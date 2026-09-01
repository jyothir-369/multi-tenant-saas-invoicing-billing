import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';

const daysByRange: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '6m': 183, '12m': 365 };

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService) {}
  async get(range = '30d') {
    const tenantId = this.context.getTenantId();
    if (!tenantId) throw new ForbiddenException('Tenant context not available');
    const days = daysByRange[range] ?? daysByRange['30d'];
    const from = new Date(Date.now() - days * 86400000);
    const [invoices, payments, customers] = await Promise.all([
      this.prisma.invoice.findMany({ where: { tenantId, createdAt: { gte: from } } }),
      this.prisma.payment.findMany({ where: { tenantId, createdAt: { gte: from } }, include: { invoice: { include: { customer: true } } } }),
      this.prisma.customer.findMany({ where: { tenantId }, include: { invoices: true } }),
    ]);
    const completed = payments.filter(p => p.status === 'COMPLETED');
    const outstandingInvoices = await this.prisma.invoice.findMany({ where: { tenantId, status: { in: ['SENT', 'OVERDUE'] } }, include: { payments: true } });
    const outstanding = outstandingInvoices.reduce((s, i) => s + i.amount - i.payments.filter(p => p.status === 'COMPLETED').reduce((a,p) => a+p.amount,0), 0);
    const overdue = outstandingInvoices.filter(i => i.status === 'OVERDUE').reduce((s,i) => s + i.amount - i.payments.filter(p=>p.status==='COMPLETED').reduce((a,p)=>a+p.amount,0), 0);
    const revenue = new Map<string, number>();
    completed.forEach(p => { const key = p.createdAt.toISOString().slice(0, 10); revenue.set(key, (revenue.get(key) ?? 0) + p.amount); });
    const status = invoices.reduce((a,i) => ({ ...a, [i.status]: (a[i.status] ?? 0) + 1 }), {} as Record<string,number>);
    const topCustomers = customers.map(c => ({ name: c.name, invoices: c.invoices.length, billed: c.invoices.reduce((s,i)=>s+i.amount,0) })).sort((a,b)=>b.billed-a.billed).slice(0,5);
    return { range, from, to: new Date(), revenueTrends: [...revenue].map(([date, amount])=>({date,amount})), invoiceStatus: status, paymentAnalytics: { count: completed.length, amount: completed.reduce((s,p)=>s+p.amount,0), pending: payments.filter(p=>p.status==='PENDING').length, refunded: payments.filter(p=>p.status.includes('REFUND')).length }, balances: { outstanding, overdue }, activeCustomers: customers.filter(c=>!c.isArchived && c.invoices.some(i=>i.createdAt>=from)).length, topCustomers };
  }
}
