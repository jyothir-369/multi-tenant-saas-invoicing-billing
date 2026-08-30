import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';
import { UpdateTenantDto } from './dto';
import { Tenant } from '@prisma/client';

export interface TenantStats {
  totalUsers: number;
  totalCustomers: number;
  totalInvoices: number;
  totalPayments: number;
  outstandingAmount: number;
  overdueAmount: number;
  paidThisMonth: number;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getTenantId(explicitTenantId?: string): string {
    const contextTenantId = this.tenantContext.getTenantId();
    if (explicitTenantId && contextTenantId && explicitTenantId !== contextTenantId) {
      throw new ForbiddenException('Tenant access denied');
    }
    const tenantId = explicitTenantId || contextTenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not available');
    }
    return tenantId;
  }

  async findOne(id?: string): Promise<Tenant> {
    const tenantId = this.getTenantId(id);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    return tenant;
  }

  async update(dto: UpdateTenantDto, requestedTenantId?: string): Promise<Tenant> {
    const tenantId = this.getTenantId(requestedTenantId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.name?.trim() ?? tenant.name,
        plan: dto.plan ?? tenant.plan,
      },
    });
  }

  async getStats(requestedTenantId?: string): Promise<TenantStats> {
    const tenantId = this.getTenantId(requestedTenantId);

    const [
      userCount,
      customerCount,
      invoiceCount,
      paymentCount,
      invoices,
      payments,
    ] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.customer.count({ where: { tenantId, isArchived: false } }),
      this.prisma.invoice.count({ where: { tenantId } }),
      this.prisma.payment.count({ where: { tenantId } }),
      this.prisma.invoice.findMany({
        where: { tenantId },
        select: { amount: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: { tenantId, status: 'COMPLETED' },
        select: { amount: true, createdAt: true },
      }),
    ]);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const outstandingAmount = invoices
      .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
      .reduce((sum, i) => sum + i.amount, 0);

    const overdueAmount = invoices
      .filter((i) => i.status === 'OVERDUE')
      .reduce((sum, i) => sum + i.amount, 0);

    const paidThisMonth = payments
      .filter((p) => new Date(p.createdAt) >= startOfMonth)
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      totalUsers: userCount,
      totalCustomers: customerCount,
      totalInvoices: invoiceCount,
      totalPayments: paymentCount,
      outstandingAmount,
      overdueAmount,
      paidThisMonth,
    };
  }
}
