import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';
import { Customer } from '@prisma/client';

export interface CustomerWithBalance extends Customer {
  balance: number;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not available');
    }
    return tenantId;
  }

  async create(dto: CreateCustomerDto): Promise<CustomerWithBalance> {
    const tenantId = this.getTenantId();

    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name,
        email: dto.email,
        tenantId,
      },
    });

    return { ...customer, balance: 0 };
  }

  async findAll(includeArchived = false): Promise<CustomerWithBalance[]> {
    const tenantId = this.getTenantId();

    const where: any = { tenantId };
    if (!includeArchived) {
      where.isArchived = false;
    }

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return this.attachBalances(customers);
  }

  async findOne(id: string): Promise<CustomerWithBalance> {
    const tenantId = this.getTenantId();

    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    const balance = await this.calculateBalance(id);
    return { ...customer, balance };
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerWithBalance> {
    const tenantId = this.getTenantId();

    const existing = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        email: dto.email ?? existing.email,
        isArchived: dto.isArchived ?? existing.isArchived,
      },
    });

    const balance = await this.calculateBalance(id);
    return { ...customer, balance };
  }

  async archive(id: string): Promise<CustomerWithBalance> {
    return this.update(id, { isArchived: true });
  }

  async unarchive(id: string): Promise<CustomerWithBalance> {
    return this.update(id, { isArchived: false });
  }

  async delete(id: string): Promise<void> {
    const tenantId = this.getTenantId();

    const existing = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    await this.prisma.customer.delete({
      where: { id },
    });
  }

  private async calculateBalance(customerId: string): Promise<number> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        customerId,
        status: { in: ['SENT', 'OVERDUE'] },
      },
    });

    const invoiceIds = invoices.map((inv) => inv.id);

    const payments = await this.prisma.payment.findMany({
      where: {
        invoiceId: { in: invoiceIds },
        status: 'COMPLETED',
      },
    });

    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalPaid = payments.reduce((sum, pay) => sum + pay.amount, 0);

    return totalInvoiced - totalPaid;
  }

  private async attachBalances(customers: Customer[]): Promise<CustomerWithBalance[]> {
    const customersWithBalance: CustomerWithBalance[] = [];

    for (const customer of customers) {
      const balance = await this.calculateBalance(customer.id);
      customersWithBalance.push({ ...customer, balance });
    }

    return customersWithBalance;
  }
}
