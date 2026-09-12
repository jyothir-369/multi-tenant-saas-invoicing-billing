import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService }
import { AuditService } from '../audit/audit.service'; from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';
import { CreateCustomerDto, UpdateCustomerDto, CreateNoteDto, UpdateNoteDto } from './dto';
import { Customer, CustomerNote } from '@prisma/client';

export interface CustomerWithBalance extends Customer {
  balance: number;
  lastInvoiceDate?: Date | null;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      data: { name: dto.name, email: dto.email, tenantId },
    });
    return { ...customer, balance: 0, lastInvoiceDate: null };
  }

  async findAll({ includeArchived = false, search, sort, page = 1, limit = 20 }: {
    includeArchived?: boolean; search?: string; sort?: string; page?: number; limit?: number;
  }): Promise<{ data: CustomerWithBalance[]; total: number }> {
    const tenantId = this.getTenantId();
    const where: any = { tenantId };
    if (!includeArchived) {
      where.archivedAt = null;
    }
    if (search) {
      const q = search.trim().toLowerCase();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allowedSort = ['name', 'email', 'balance', 'lastInvoiceDate'];
    const sortField = allowedSort.includes(sort || '') ? (sort || 'createdAt') : 'createdAt';

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: sortField === 'balance' || sortField === 'lastInvoiceDate' ? undefined : { [sortField]: 'asc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const withBalances = await this.attachBalances(customers);
    // For balance/lastInvoiceDate sorting, sort in memory after attaching
    if (sortField === 'balance') {
      withBalances.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
    } else if (sortField === 'lastInvoiceDate') {
      withBalances.sort((a, b) => {
        const da = a.lastInvoiceDate ? new Date(a.lastInvoiceDate).getTime() : 0;
        const db = b.lastInvoiceDate ? new Date(b.lastInvoiceDate).getTime() : 0;
        return db - da;
      });
    }

    return { data: withBalances, total };
  }

  async findOne(id: string): Promise<CustomerWithBalance & { invoiceCount: number; notesCount: number }> {
    const tenantId = this.getTenantId();
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) throw new NotFoundException(`Customer with ID ${id} not found`);
    const balance = await this.calculateBalance(id);
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { customerId: id, tenantId },
      orderBy: { issuedAt: 'desc' },
    });
    const invoiceCount = await this.prisma.invoice.count({ where: { customerId: id, tenantId } });
    const notesCount = await this.prisma.customerNote.count({ where: { customerId: id, tenantId } });
    return { ...customer, balance, lastInvoiceDate: lastInvoice?.issuedAt ?? null, invoiceCount, notesCount };
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerWithBalance> {
    const tenantId = this.getTenantId();
    const existing = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Customer with ID ${id} not found`);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        email: dto.email ?? existing.email,
        isArchived: dto.isArchived ?? existing.isArchived,
        archivedAt: dto.isArchived === true ? new Date() : (dto.isArchived === false ? null : existing.archivedAt),
      },
    });
    const balance = await this.calculateBalance(id);
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { customerId: id, tenantId },
      orderBy: { issuedAt: 'desc' },
    });
    return { ...customer, balance, lastInvoiceDate: lastInvoice?.issuedAt ?? null };
  }

  async archive(id: string): Promise<CustomerWithBalance> {
    return this.update(id, { isArchived: true });
  }

  async unarchive(id: string): Promise<CustomerWithBalance> {
    return this.update(id, { isArchived: false });
  }

  async delete(id: string): Promise<void> {
    const tenantId = this.getTenantId();
    const existing = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Customer with ID ${id} not found`);
    await this.prisma.customer.delete({ where: { id } });
  }

  // Notes
  async listNotes(id: string) {
    const tenantId = this.getTenantId();
    await this.checkCustomerExists(id, tenantId);
    return this.prisma.customerNote.findMany({
      where: { customerId: id, tenantId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } },
    });
  }

  async createNote(id: string, dto: CreateNoteDto, authorUserId: string) {
    const tenantId = this.getTenantId();
    await this.checkCustomerExists(id, tenantId);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Note content is required');
    if (content.length > 5000) throw new BadRequestException('Note content exceeds 5000 characters');
    return this.prisma.customerNote.create({
      data: {
        tenantId,
        customerId: id,
        authorUserId,
        content,
      },
      include: { user: { select: { email: true, name: true } } },
    });
  }

  async updateNote(id: string, noteId: string, dto: UpdateNoteDto) {
    const tenantId = this.getTenantId();
    await this.checkCustomerExists(id, tenantId);
    const note = await this.prisma.customerNote.findFirst({ where: { id: noteId, customerId: id, tenantId } });
    if (!note) throw new NotFoundException('Note not found');
    if (dto.content !== undefined) {
      const content = dto.content.trim();
      if (!content) throw new BadRequestException('Note content is required');
      if (content.length > 5000) throw new BadRequestException('Note content exceeds 5000 characters');
      return this.prisma.customerNote.update({
        where: { id: noteId },
        data: { content },
        include: { user: { select: { email: true, name: true } } },
      });
    }
    return note;
  }

  async deleteNote(id: string, noteId: string) {
    const tenantId = this.getTenantId();
    await this.checkCustomerExists(id, tenantId);
    const note = await this.prisma.customerNote.findFirst({ where: { id: noteId, customerId: id, tenantId } });
    if (!note) throw new NotFoundException('Note not found');
    await this.prisma.customerNote.delete({ where: { id: noteId } });
    return { deleted: true };
  }

  // Invoices
  async listInvoices(id: string, { page = 1, limit = 20 }: { page?: number; limit?: number }) {
    const tenantId = this.getTenantId();
    await this.checkCustomerExists(id, tenantId);
    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { customerId: id, tenantId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where: { customerId: id, tenantId } }),
    ]);
    return { data: invoices, total };
  }

  // Payments
  async listPayments(id: string, { page = 1, limit = 20 }: { page?: number; limit?: number }) {
    const tenantId = this.getTenantId();
    await this.checkCustomerExists(id, tenantId);
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { invoice: { customerId: id }, tenantId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { invoice: { select: { id: true, number: true } } },
      }),
      this.prisma.payment.count({ where: { invoice: { customerId: id }, tenantId } }),
    ]);
    return { data: payments, total };
  }

  // Activity timeline
  async getActivity(id: string) {
    const tenantId = this.getTenantId();
    await this.checkCustomerExists(id, tenantId);
    const activities: { type: string; text: string; timestamp: Date; icon?: string }[] = [];

    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (customer) {
      activities.push({ type: 'created', text: `Customer ${customer.name} created`, timestamp: customer.createdAt, icon: 'user-plus' });
    }

    const invoices = await this.prisma.invoice.findMany({ where: { customerId: id, tenantId }, orderBy: { createdAt: 'asc' } });
    for (const inv of invoices) {
      activities.push({ type: 'invoice_created', text: `Invoice ${inv.id} created`, timestamp: inv.createdAt, icon: 'file-text' });
      if (inv.sentAt) activities.push({ type: 'invoice_sent', text: `Invoice ${inv.id} marked sent`, timestamp: inv.sentAt, icon: 'send' });
      if (inv.paidAt) activities.push({ type: 'invoice_paid', text: `Invoice ${inv.id} marked paid`, timestamp: inv.paidAt, icon: 'check-circle' });
    }

    const notes = await this.prisma.customerNote.findMany({ where: { customerId: id, tenantId }, orderBy: { createdAt: 'asc' } });
    for (const note of notes) {
      activities.push({ type: 'note_added', text: `Note added`, timestamp: note.createdAt, icon: 'sticky-note' });
    }

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return activities;
  }

  // Balance computation (derived, never stored)
  async calculateBalance(customerId: string): Promise<number> {
    const tenantId = this.getTenantId();
    const invoices = await this.prisma.invoice.findMany({
      where: { customerId, tenantId, status: { in: ['SENT', 'OVERDUE'] } },
      select: { totalCents: true },
    });
    const invoiceTotal = invoices.reduce((sum, inv) => sum + inv.totalCents, 0);

    const invoiceIds = invoices.map(i => i.id);
    // Payments are linked by invoiceId; we need payments for invoices of this customer
    const allInvoices = await this.prisma.invoice.findMany({
      where: { customerId, tenantId },
      select: { id: true },
    });
    const allInvoiceIds = allInvoices.map(i => i.id);

    const payments = await this.prisma.payment.findMany({
      where: { invoiceId: { in: allInvoiceIds }, status: 'SUCCEEDED', tenantId },
      select: { amount: true },
    });
    const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);

    return invoiceTotal - paymentsTotal;
  }

  private async attachBalances(customers: Customer[]): Promise<CustomerWithBalance[]> {
    const result: CustomerWithBalance[] = [];
    for (const c of customers) {
      const balance = await this.calculateBalance(c.id);
      const last = await this.prisma.invoice.findFirst({
        where: { customerId: c.id, tenantId: c.tenantId },
        orderBy: { issuedAt: 'desc' },
      });
      result.push({ ...c, balance, lastInvoiceDate: last?.issuedAt ?? null });
    }
    return result;
  }

  private async checkCustomerExists(id: string, tenantId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Customer not found');
  }

  // CSV Export
  async exportCSV(): Promise<string> {
    const tenantId = this.getTenantId();
    const customers = await this.prisma.customer.findMany({
      where: { tenantId, archivedAt: null },
      orderBy: { name: 'asc' },
    });
    const headers = ['name', 'email', 'balance_cents', 'last_invoice_date'];
    const lines = [headers.join(',')];
    for (const c of customers) {
      const balance = await this.calculateBalance(c.id);
      const last = await this.prisma.invoice.findFirst({ where: { customerId: c.id, tenantId }, orderBy: { issuedAt: 'desc' } });
      const balanceStr = String(balance);
      const dateStr = last ? last.issuedAt.toISOString().split('T')[0] : '';
      const escapedName = this.escapeCsv(c.name);
      const escapedEmail = this.escapeCsv(c.email);
      lines.push(`${escapedName},${escapedEmail},${balanceStr},${dateStr}`);
    }
    return lines.join('\r\n');
  }

  private escapeCsv(value: string): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
}
