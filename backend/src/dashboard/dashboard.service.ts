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
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService) {}

  async getBalance(): Promise<DashboardBalance> {
    const tenantId = this.context.getTenantId();
    if (!tenantId) throw new ForbiddenException('Tenant context not available');
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const rows = await this.prisma.$queryRaw<Array<{ outstanding: bigint | number; overdue: bigint | number; paidThisMonth: bigint | number }>>`
      SELECT
        COALESCE(SUM(CASE WHEN i.status = 'SENT' AND i.due_date >= NOW() THEN i.amount - COALESCE(p.paid, 0) ELSE 0 END), 0) AS outstanding,
        COALESCE(SUM(CASE WHEN (i.status = 'OVERDUE' OR (i.status = 'SENT' AND i.due_date < NOW())) THEN i.amount - COALESCE(p.paid, 0) ELSE 0 END), 0) AS overdue,
        COALESCE((SELECT SUM(amount) FROM payments WHERE tenant_id = ${tenantId} AND status = 'COMPLETED' AND created_at >= ${startOfMonth}), 0) AS "paidThisMonth"
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
