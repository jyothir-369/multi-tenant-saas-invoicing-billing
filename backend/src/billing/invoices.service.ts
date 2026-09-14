import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto';
import { CreateLineItemDto, UpdateLineItemDto } from './dto';
import { InvoiceStatus, Invoice } from '@prisma/client';

export interface InvoiceWithDetails extends Invoice {
  customerName?: string;
  customerEmail?: string;
  balance?: number;
  invoiceNumber?: string;
  amount?: number;
  paymentLink?: string;
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

  private async generateInvoiceNumber(tenantId: string, tx: any = this.prisma): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const counter = await tx.$queryRaw<InvoiceCounter[]>`
      SELECT id, tenant_id as "tenantId", year, last_number as "lastNumber"
      FROM invoice_counters
      WHERE tenant_id = ${tenantId} AND year = ${year}
      FOR UPDATE
    `.catch(() => []);

    if (counter.length > 0) {
      await tx.$executeRaw`
        UPDATE invoice_counters
        SET last_number = last_number + 1
        WHERE tenant_id = ${tenantId} AND year = ${year}
      `;
      return `${prefix}${String(counter[0].lastNumber + 1).padStart(6, '0')}`;
    }

    await tx.$executeRaw`
      INSERT INTO invoice_counters (id, tenant_id, year, last_number)
      VALUES (gen_random_uuid(), ${tenantId}, ${year}, 1)
    `;
    return `${prefix}${String(1).padStart(6, '0')}`;
  }

  async recalculateTotals(invoiceId: string, tenantId: string): Promise<void> {
    const items = await this.prisma.lineItem.findMany({
      where: { invoiceId, tenantId },
    });
    let subtotal = 0;
    let tax = 0;
    for (const item of items) {
      const itemSubtotal = item.quantity * item.unitPriceCents;
      subtotal += itemSubtotal;
      tax += Math.round(itemSubtotal * (item.taxRateBps || 0) / 10000);
    }
    const discount = 0;
    const total = subtotal + tax - discount;
    await this.prisma.invoice.update({
      where: { id: invoiceId, tenantId },
      data: { subtotalCents: subtotal, taxCents: tax, discountCents: discount, totalCents: total },
    });
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

  /**
   * A customer-facing payment link for a sent invoice. Reuses an existing
   * unexpired PENDING link so repeated calls (send + refresh) stay idempotent.
   */
  private async resolvePaymentLink(
    invoiceId: string,
    tenantId: string,
  ): Promise<string | undefined> {
    const existing = await this.prisma.paymentLink.findFirst({
      where: { invoiceId, tenantId, status: 'PENDING' },
    });
    if (existing && new Date(existing.expiresAt) > new Date()) {
      return `${this.frontendUrl()}/pay/${existing.token}`;
    }
    return undefined;
  }

  private async createPaymentLink(
    invoiceId: string,
    tenantId: string,
    totalCents: number,
  ): Promise<string> {
    const existing = await this.prisma.paymentLink.findFirst({
      where: { invoiceId, tenantId, status: 'PENDING' },
    });
    if (existing && new Date(existing.expiresAt) > new Date()) {
      return `${this.frontendUrl()}/pay/${existing.token}`;
    }
    const token = randomBytes(32).toString('hex');
    await this.prisma.paymentLink.create({
      data: {
        tenantId,
        invoiceId,
        token,
        amountCents: totalCents || 0,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    return `${this.frontendUrl()}/pay/${token}`;
  }

  private frontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  async create(dto: CreateInvoiceDto): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();

    await this.validateCustomerOwnership(dto.customerId, tenantId);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const number = await this.generateInvoiceNumber(tenantId, tx);
      const inv = await (tx as any).invoice.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        number,
        totalCents: dto.amount, // DTO amount is in cents (mapped to totalCents below)
        dueDate: new Date(dto.dueDate),
        recurrenceRule: dto.recurrenceRule,
        requiresSignature: dto.requiresSignature ?? false,
        status: InvoiceStatus.DRAFT,
      },
      include: {
        customer: {
          select: { name: true, email: true },
        },
      },
    });

      return {
        ...inv,
        customerName: inv.customer.name,
        customerEmail: inv.customer.email,
      };
    });
    return invoice;
  }

  async findAll(query?: { status?: InvoiceStatus; search?: string; sort?: string; order?: 'asc' | 'desc'; page?: number; pageSize?: number }): Promise<{ data: InvoiceWithDetails[]; total: number }> {
    const tenantId = this.getTenantId();
    const status = query?.status;
    const search = query?.search || '';
    const sort = query?.sort || 'createdAt';
    const order = query?.order || 'desc';
    const page = Math.max(1, query?.page || 1);
    const pageSize = Math.min(50, Math.max(5, query?.pageSize || 20));

    const where: any = { tenantId };
    if (status) where.status = status;
    if (search.trim()) {
      where.OR = [
        { customer: { name: { contains: search.trim(), mode: 'insensitive' } } },
        { customer: { email: { contains: search.trim(), mode: 'insensitive' } } },
        { id: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const orderBy: any = {};
    if (['invoiceNumber','customerName','status','totalCents','dueDate'].includes(sort)) {
      if (sort === 'customerName') orderBy.customer = { name: order };
      else if (sort === 'invoiceNumber') orderBy.invoiceNumber = order;
      else if (sort === 'status') orderBy.status = order;
      else if (sort === 'totalCents') orderBy.totalCents = order;
      else if (sort === 'dueDate') orderBy.dueDate = order;
    } else {
      orderBy.createdAt = order;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { name: true, email: true } },
          payments: true,
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const links = invoices.length
      ? await this.prisma.paymentLink.findMany({
          where: { tenantId, invoiceId: { in: invoices.map((i) => i.id) }, status: 'PENDING' },
        })
      : [];
    const now = Date.now();
    const linkByInvoice = new Map(
      links
        .filter((l) => new Date(l.expiresAt).getTime() > now)
        .map((l) => [l.invoiceId, `${this.frontendUrl()}/pay/${l.token}`]),
    );

    return {
      data: invoices.map((invoice) => ({
        ...invoice,
        customerName: invoice.customer.name,
        customerEmail: invoice.customer.email,
        balance: (invoice.totalCents || 0) - invoice.payments.reduce((sum, p) => sum + p.amount, 0),
        invoiceNumber: invoice.number || `INV-${invoice.id.slice(0, 6).toUpperCase()}`,
        amount: invoice.totalCents || 0,
        paymentLink: linkByInvoice.get(invoice.id),
      })),
      total,
    };
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
        lineItems: true,
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
      balance: invoice.totalCents - totalPaid,
      invoiceNumber:
        invoice.number || `INV-${invoice.id.slice(0, 6).toUpperCase()}`,
      amount: invoice.totalCents,
      paymentLink: await this.resolvePaymentLink(id, tenantId),
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

    if (existing.status !== InvoiceStatus.DRAFT && (dto.amount || dto.dueDate || dto.recurrenceRule || dto.requiresSignature !== undefined)) {
      throw new BadRequestException('Can only modify amount, due date, recurrence rule, and signature requirement for DRAFT invoices');
    }

    const updateData: any = {};
    if (dto.amount !== undefined) updateData.totalCents = dto.amount;
    if (dto.dueDate !== undefined) updateData.dueDate = new Date(dto.dueDate);
    if (dto.recurrenceRule !== undefined) updateData.recurrenceRule = dto.recurrenceRule;
    if (dto.requiresSignature !== undefined) updateData.requiresSignature = dto.requiresSignature;
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
      balance: invoice.totalCents - totalPaid,
      paymentLink: await this.resolvePaymentLink(id, tenantId),
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
      data: { status: InvoiceStatus.SENT, sentAt: new Date() },
      include: {
        customer: {
          select: { name: true, email: true },
        },
        payments: true,
      },
    });

    // F2: a sent invoice always gets a customer-facing payment link so it can
    // actually be paid through the hosted checkout.
    const paymentLink = await this.createPaymentLink(
      id,
      tenantId,
      invoice.totalCents,
    );

    await this.createOutboxEvent(tenantId, 'INVOICE_SENT', {
      invoiceId: id,
      customerId: invoice.customerId,
      amount: invoice.totalCents,
      dueDate: invoice.dueDate.toISOString(),
      paymentLink,
    });

    const totalPaid = updated.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...updated,
      customerName: updated.customer.name,
      customerEmail: updated.customer.email,
      balance: updated.totalCents - totalPaid,
      paymentLink,
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
      amount: invoice.totalCents,
      paidAt: new Date().toISOString(),
    });

    const totalPaid = updated.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...updated,
      customerName: updated.customer.name,
      customerEmail: updated.customer.email,
      balance: updated.totalCents - totalPaid,
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
      amount: invoice.totalCents,
      dueDate: invoice.dueDate.toISOString(),
    });

    const totalPaid = updated.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...updated,
      customerName: updated.customer.name,
      customerEmail: updated.customer.email,
      balance: updated.totalCents - totalPaid,
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
      balance: updated.totalCents - totalPaid,
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


  async getTabCounts(): Promise<Record<string, number>> {
    const tenantId = this.getTenantId();
    const [all, draft, sent, overdue, paid, void_] = await Promise.all([
      this.prisma.invoice.count({ where: { tenantId } }),
      this.prisma.invoice.count({ where: { tenantId, status: InvoiceStatus.DRAFT } }),
      this.prisma.invoice.count({ where: { tenantId, status: InvoiceStatus.SENT } }),
      this.prisma.invoice.count({ where: { tenantId, status: InvoiceStatus.OVERDUE } }),
      this.prisma.invoice.count({ where: { tenantId, status: InvoiceStatus.PAID } }),
      this.prisma.invoice.count({ where: { tenantId, status: InvoiceStatus.VOID } }),
    ]);
    return { all, draft, sent, overdue, paid, void: void_ };
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
      const balance = invoice.totalCents - totalPaid;

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
  async addLineItem(invoiceId: string, dto: CreateLineItemDto): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const subtotal = dto.quantity * dto.unitPriceCents;
    await this.prisma.lineItem.create({
      data: {
        invoiceId,
        tenantId,
        description: dto.description,
        quantity: dto.quantity,
        unitPriceCents: dto.unitPriceCents,
        taxRateBps: dto.taxRateBps ?? 0,
        subtotalCents: subtotal,
      },
    });
    await this.recalculateTotals(invoiceId, tenantId);
    return this.findOne(invoiceId);
  }

  async updateLineItem(invoiceId: string, lineItemId: string, dto: UpdateLineItemDto): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();
    const existing = await this.prisma.lineItem.findFirst({ where: { id: lineItemId, invoiceId, tenantId } });
    if (!existing) throw new NotFoundException('Line item not found');
    const qty = dto.quantity ?? existing.quantity;
    const price = dto.unitPriceCents ?? existing.unitPriceCents;
    await this.prisma.lineItem.update({
      where: { id: lineItemId, tenantId },
      data: {
        description: dto.description,
        quantity: qty,
        unitPriceCents: price,
        taxRateBps: dto.taxRateBps ?? existing.taxRateBps,
        subtotalCents: qty * price,
      },
    });
    await this.recalculateTotals(invoiceId, tenantId);
    return this.findOne(invoiceId);
  }

  async deleteLineItem(invoiceId: string, lineItemId: string): Promise<InvoiceWithDetails> {
    const tenantId = this.getTenantId();
    const existing = await this.prisma.lineItem.findFirst({ where: { id: lineItemId, invoiceId, tenantId } });
    if (!existing) throw new NotFoundException('Line item not found');
    await this.prisma.lineItem.delete({ where: { id: lineItemId, tenantId } });
    await this.recalculateTotals(invoiceId, tenantId);
    return this.findOne(invoiceId);
  }
  }


