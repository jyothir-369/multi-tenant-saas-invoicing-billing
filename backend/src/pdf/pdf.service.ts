import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';

export interface PdfLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRateBps: number;
  subtotalCents: number;
}

export interface InvoicePdfProps {
  invoiceNumber: string;
  status: string;
  issuedDate: string;
  dueDate: string;
  customerName: string;
  customerEmail: string;
  tenantName: string;
  tenantLogoUrl?: string;
  lineItems: PdfLineItem[];
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

@Injectable()
export class PdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new NotFoundException('Tenant context not available');
    return tenantId;
  }

  async buildInvoicePdfProps(invoiceId: string): Promise<InvoicePdfProps> {
    const tenantId = this.getTenantId();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        customer: { select: { name: true, email: true } },
        lineItems: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true, logoUrl: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const lineItems: PdfLineItem[] = (invoice.lineItems || []).map((li: any) => ({
      description: li.description,
      quantity: li.quantity,
      unitPriceCents: li.unitPriceCents,
      taxRateBps: li.taxRateBps || 0,
      subtotalCents: li.subtotalCents,
    }));

    const subtotalCents = invoice.subtotalCents || lineItems.reduce((s, li) => s + li.subtotalCents, 0);
    const taxCents = invoice.taxCents || Math.round(subtotalCents * ((lineItems[0]?.taxRateBps || 0) / 10000)); // simplified; real tax already computed in invoice
    const discountCents = invoice.discountCents || 0;
    const totalCents = invoice.totalCents || (subtotalCents + taxCents - discountCents);

    return {
      invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 4)}`,
      status: invoice.status,
      issuedDate: invoice.createdAt.toISOString().split('T')[0],
      dueDate: new Date(invoice.dueDate).toISOString().split('T')[0],
      customerName: invoice.customer?.name || 'Unknown',
      customerEmail: invoice.customer?.email || '',
      tenantName: tenant.name || 'Ledgerly',
      tenantLogoUrl: tenant.logoUrl || undefined,
      lineItems,
      subtotalCents,
      taxCents,
      discountCents,
      totalCents,
    };
  }

  async generateInvoicePdfBuffer(invoiceId: string): Promise<Buffer> {
    const props = await this.buildInvoicePdfProps(invoiceId);
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Helper: format currency
    const fmt = (cents: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

    // Teal accent
    const TEAL = '#0F766E';

    // Header — tenant name left, invoice label + number right
    doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL).text(props.tenantName, 40, 40);
    if (props.tenantLogoUrl) {
      // Logo placeholder — skip pure-embed for serverless; fetch or embed when blob storage lands
    }
    // TODO(item-6): persist PDF to blob storage when email delivery lands
    doc.font('Helvetica-Bold').fontSize(24).fillColor(TEAL).text('INVOICE', 350, 40, { align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#333').text(`No. ${props.invoiceNumber}`, 350, 68, { align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text(`Status: ${props.status}`, 350, 82, { align: 'right' });

    // Teal rule
    doc.moveTo(40, 100).lineTo(552, 100).lineWidth(2).stroke(TEAL);
    doc.lineWidth(1);
    doc.stroke();
    doc.lineWidth(1);

    // Billing block
    let y = 120;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333').text('Bill To:', 40, y);
    doc.font('Helvetica').fontSize(10).fillColor('#333').text(props.customerName, 40, y + 14);
    doc.text(props.customerEmail, 40, y + 28);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333').text('Issued:', 320, y);
    doc.font('Helvetica').fontSize(10).fillColor('#333').text(props.issuedDate, 370, y);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333').text('Due:', 320, y + 14);
    doc.font('Helvetica').fontSize(10).fillColor('#333').text(props.dueDate, 370, y + 14);

    // Line items table
    y = 170;
    const colDesc = 40;
    const colQty = 310;
    const colPrice = 370;
    const colTax = 430;
    const colSub = 490;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F766E').text('Description', colDesc, y);
    doc.text('Qty', colQty, y, { align: 'right' });
    doc.text('Unit Price', colPrice, y, { align: 'right' });
    doc.text('Tax %', colTax, y, { align: 'right' });
    doc.text('Subtotal', colSub, y, { align: 'right' });
    doc.moveTo(40, y + 14).lineTo(552, y + 14).stroke('#ccc');

    y += 22;
    doc.font('Helvetica').fontSize(9).fillColor('#333');
    for (const item of props.lineItems) {
      const taxPct = item.taxRateBps ? (item.taxRateBps / 100).toFixed(0) + '%' : '0%';
      doc.text(item.description || '-', colDesc, y, { width: 260 });
      doc.text(String(item.quantity), colQty, y, { align: 'right' });
      doc.text(fmt(item.unitPriceCents), colPrice, y, { align: 'right' });
      doc.text(taxPct, colTax, y, { align: 'right' });
      doc.text(fmt(item.subtotalCents), colSub, y, { align: 'right' });
      y += 16;
    }

    doc.moveTo(40, y + 2).lineTo(552, y + 2).stroke('#ccc');

    // Totals (bottom-right)
    y += 10;
    const totalsX = 350;
    doc.font('Helvetica').fontSize(10).fillColor('#333');
    doc.text('Subtotal', totalsX, y, { align: 'right' });
    doc.text(fmt(props.subtotalCents), 552, y, { align: 'right' });
    y += 14;
    doc.text('Tax', totalsX, y, { align: 'right' });
    doc.text(fmt(props.taxCents), 552, y, { align: 'right' });
    y += 14;
    if (props.discountCents > 0) {
      doc.text('Discount', totalsX, y, { align: 'right' });
      doc.text('-' + fmt(props.discountCents), 552, y, { align: 'right' });
      y += 14;
    }
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0F766E');
    doc.text('Total', totalsX, y, { align: 'right' });
    doc.text(fmt(props.totalCents), 552, y, { align: 'right' });

    // Footer
    y = 730;
    doc.fontSize(8).fillColor('#999');
    doc.text('Generated by Ledgerly · Invoice PDF', 40, y, { align: 'left' });
    doc.text(`Tenant: ${props.tenantName}`, 40, y + 12, { align: 'left' });

    doc.end();

    return new Promise((resolve, reject) => {
      const resolveBuffer = () => resolve(Buffer.concat(chunks));
      doc.on('end', resolveBuffer);
      doc.on('error', reject);
    });
  }
}
