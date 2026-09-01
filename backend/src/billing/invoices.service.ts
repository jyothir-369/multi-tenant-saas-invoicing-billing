import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto';
import { InvoiceStatus, Invoice } from '@prisma/client';

export interface InvoiceWithDetails extends Invoice {
  customerName?: string;
  customerEmail?: string;
  balance?: number;
}

interface InvoiceCounter {
  id: string;
  tenantId: string;
  lastNumber: number;
}

const VALID_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['SENT', 'VOID'],
  SENT: ['PAID', 'OVERDUE', 'VOID'],
  PAID: [],
  OVERDUE: ['PAID', 'VOID'],
  VOID: [],
};

@Injectable()
export class InvoicesService {
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

  private validateStatusTransition(currentStatus: InvoiceStatus, newStatus: InvoiceStatus): void {
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}. Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`,
      );
    }
  }

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const counter = await this.prisma.$queryRaw<InvoiceCounter[]>`
      SELECT id, tenant_id as "tenantId", last_number as "lastNumber"
      FROM invoice_counters
      WHERE tenant_id = ${tenantId} AND year = ${year}
      FOR UPDATE
    `.catch(() => []);

    let lastNumber = 0;

    if (counter.length > 0) {
      lastNumber = counter[0].lastNumber;
      await this.prisma.$executeRaw`
        UPDATE invoice_counters
        SET last_number = last_number + 1
        WHERE tenant_id = ${tenantId} AND year = ${year}
      `;
    } else {
      await this.prisma.$executeRaw`
        INSERT INTO invoice_counters (id, tenant_id, year, last_number)
        VALUES (gen_random_uuid(), ${tenantId}, ${year}, 1)
      `;
    }

    return `${prefix}${String(lastNumber + 1).padStart(6, '0')}`;
  }

  private async validateCustomerOwnership(customerId: string, tenantId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    if (customer.isArchived) {
      throw new BadRequestException('Cannot create invoice for archived customer');
    }
  }

  private async createOutboxEvent(
    tenantId: string,
    type: string,
    payload: Record<string, any>,
  ): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        tenantId,
        type,
        payload,
      },
    });
  }

  async create(dto: CreateInvoiceDto): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();

    await this.validateCustomerOwnership(dto.customerId, tenantId);

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        recurrenceRule: dto.recurrenceRule,
        status: InvoiceStatus.DRAFT,
      },
      include: {
        customer: {
          select: { name: true, email: true },
        },
      },
    });

    return {
      ...invoice,
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
    };
  }

  async findAll(status?: InvoiceStatus): Promise<InvoiceWithDetails[]> {
    const tenantId = this.getTenantId();

    const where: any = { tenantId };
    if (status) {
      where.status = status;
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        customer: {
          select: { name: true, email: true },
        },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map((invoice) => ({
      ...invoice,
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      balance: invoice.amount - invoice.payments.reduce((sum, p) => sum + p.amount, 0),
    }));
  }

  async findOne(id: string): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        customer: {
          select: { name: true, email: true },
        },
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...invoice,
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      balance: invoice.amount - totalPaid,
    };
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();

    const existing = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (dto.status && dto.status !== existing.status) {
      this.validateStatusTransition(existing.status, dto.status as InvoiceStatus);
    }

    if (existing.status !== InvoiceStatus.DRAFT && (dto.amount || dto.dueDate || dto.recurrenceRule)) {
      throw new BadRequestException('Can only modify amount, due date, and recurrence rule for DRAFT invoices');
    }

    const updateData: any = {};
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.dueDate !== undefined) updateData.dueDate = new Date(dto.dueDate);
    if (dto.recurrenceRule !== undefined) updateData.recurrenceRule = dto.recurrenceRule;
    if (dto.status !== undefined) updateData.status = dto.status;

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: { name: true, email: true },
        },
        payments: true,
      },
    });

    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...invoice,
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      balance: invoice.amount - totalPaid,
    };
  }

  async send(id: string): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be sent');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT },
      include: {
        customer: {
          select: { name: true, email: true },
        },
        payments: true,
      },
    });

    await this.createOutboxEvent(tenantId, 'INVOICE_SENT', {
      invoiceId: id,
      customerId: invoice.customerId,
      amount: invoice.amount,
      dueDate: invoice.dueDate.toISOString(),
    });

    const totalPaid = updated.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...updated,
      customerName: updated.customer.name,
      customerEmail: updated.customer.email,
      balance: updated.amount - totalPaid,
    };
  }

  async markPaid(id: string): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    this.validateStatusTransition(invoice.status, InvoiceStatus.PAID);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID },
      include: {
        customer: {
          select: { name: true, email: true },
        },
        payments: true,
      },
    });

    await this.createOutboxEvent(tenantId, 'INVOICE_PAID', {
      invoiceId: id,
      customerId: invoice.customerId,
      amount: invoice.amount,
      paidAt: new Date().toISOString(),
    });

    const totalPaid = updated.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...updated,
      customerName: updated.customer.name,
      customerEmail: updated.customer.email,
      balance: updated.amount - totalPaid,
    };
  }

  async markOverdue(id: string): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    this.validateStatusTransition(invoice.status, InvoiceStatus.OVERDUE);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.OVERDUE },
      include: {
        customer: {
          select: { name: true, email: true },
        },
        payments: true,
      },
    });

    await this.createOutboxEvent(tenantId, 'INVOICE_OVERDUE', {
      invoiceId: id,
      customerId: invoice.customerId,
      amount: invoice.amount,
      dueDate: invoice.dueDate.toISOString(),
    });

    const totalPaid = updated.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...updated,
      customerName: updated.customer.name,
      customerEmail: updated.customer.email,
      balance: updated.amount - totalPaid,
    };
  }

  async void(id: string): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    this.validateStatusTransition(invoice.status, InvoiceStatus.VOID);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.VOID },
      include: {
        customer: {
          select: { name: true, email: true },
        },
        payments: true,
      },
    });

    const totalPaid = updated.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...updated,
      customerName: updated.customer.name,
      customerEmail: updated.customer.email,
      balance: updated.amount - totalPaid,
    };
  }

  async delete(id: string): Promise<void> {
    const tenantId = this.getTenantId();

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be deleted');
    }

    await this.prisma.invoice.delete({
      where: { id },
    });
  }

  async getDashboardBalance(): Promise<{
    outstanding: number;
    overdue: number;
    paidThisMonth: number;
  }> {
    const tenantId = this.getTenantId();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      include: { payments: true },
    });

    let outstanding = 0;
    let overdue = 0;
    let paidThisMonth = 0;

    const now = new Date();

    for (const invoice of invoices) {
      const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
      const balance = invoice.amount - totalPaid;

      if (invoice.status === InvoiceStatus.SENT) {
        if (new Date(invoice.dueDate) < now) {
          overdue += balance;
        } else {
          outstanding += balance;
        }
      } else if (invoice.status === InvoiceStatus.OVERDUE) {
        overdue += balance;
      }

      for (const payment of invoice.payments) {
        if (payment.createdAt >= startOfMonth) {
          paidThisMonth += payment.amount;
        }
      }
    }

    return { outstanding, overdue, paidThisMonth };
  }
}
