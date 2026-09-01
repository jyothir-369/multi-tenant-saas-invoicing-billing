import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';

export interface DashboardBalance {
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  async getBalance(): Promise<DashboardBalance> {
    const tenantId = this.context.getTenantId();

    if (!tenantId) {
      throw new ForbiddenException('Tenant context not available');
    }

    const now = new Date();

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    );

    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          status: {
            in: ['SENT', 'OVERDUE'],
          },
        },
        select: {
          id: true,
          amount: true,
          status: true,
          dueDate: true,
          payments: {
            where: {
              tenantId,
              status: 'COMPLETED',
            },
            select: {
              amount: true,
            },
          },
        },
      }),

      this.prisma.payment.aggregate({
        where: {
          tenantId,
          status: 'COMPLETED',
          createdAt: {
            gte: startOfMonth,
          },
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    let outstanding = 0;
    let overdue = 0;

    for (const invoice of invoices) {
      const paid = invoice.payments.reduce(
        (total, payment) => total + payment.amount,
        0,
      );

      const remaining = Math.max(invoice.amount - paid, 0);

      if (
        invoice.status === 'SENT' &&
        invoice.dueDate >= now
      ) {
        outstanding += remaining;
      }

      if (
        invoice.status === 'OVERDUE' ||
        (invoice.status === 'SENT' && invoice.dueDate < now)
      ) {
        overdue += remaining;
      }
    }

    return {
      outstanding,
      overdue,
      paidThisMonth: payments._sum.amount ?? 0,
    };
  }
}