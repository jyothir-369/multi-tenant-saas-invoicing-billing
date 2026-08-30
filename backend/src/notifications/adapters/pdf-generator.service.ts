import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Use require for pdfkit to avoid TypeScript module issues
const PDFDocument = require('pdfkit');

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerEmail: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  tenantName: string;
  tenantAddress?: string;
  tenantEmail?: string;
  paymentLink?: string;
}

export interface PdfGenerationResult {
  filePath: string;
  fileName: string;
  size: number;
}

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private readonly outputDir: string;

  constructor() {
    this.outputDir = process.env.PDF_OUTPUT_DIR || './generated-pdfs';
    this.ensureOutputDirectory();
  }

  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async generateInvoicePdf(data: InvoicePdfData): Promise<PdfGenerationResult> {
    return new Promise((resolve, reject) => {
      try {
        const fileName = `invoice_${data.invoiceNumber}_${Date.now()}.pdf`;
        const filePath = path.join(this.outputDir, fileName);
        
        const doc = new PDFDocument({ margin: 50 });
        const writeStream = fs.createWriteStream(filePath);

        doc.pipe(writeStream);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
        doc.moveDown();

        // Invoice details
        doc.fontSize(10).font('Helvetica');
        doc.text(`Invoice Number: ${data.invoiceNumber}`, { align: 'right' });
        doc.text(`Date: ${data.invoiceDate}`, { align: 'right' });
        doc.text(`Due Date: ${data.dueDate}`, { align: 'right' });
        doc.moveDown();

        // From section
        doc.font('Helvetica-Bold').text('From:');
        doc.font('Helvetica').text(data.tenantName);
        if (data.tenantAddress) doc.text(data.tenantAddress);
        if (data.tenantEmail) doc.text(data.tenantEmail);
        doc.moveDown();

        // To section
        doc.font('Helvetica-Bold').text('Bill To:');
        doc.font('Helvetica').text(data.customerName);
        doc.text(data.customerEmail);
        doc.moveDown(2);

        // Items table header
        const tableTop = doc.y;
        const descriptionX = 50;
        const qtyX = 300;
        const priceX = 370;
        const totalX = 440;

        doc.font('Helvetica-Bold');
        doc.text('Description', descriptionX, tableTop);
        doc.text('Qty', qtyX, tableTop);
        doc.text('Price', priceX, tableTop);
        doc.text('Total', totalX, tableTop);

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Items
        let y = tableTop + 25;
        doc.font('Helvetica');

        for (const item of data.items) {
          doc.text(item.description, descriptionX, y, { width: 240 });
          doc.text(item.quantity.toString(), qtyX, y);
          doc.text(`$${(item.unitPrice / 100).toFixed(2)}`, priceX, y);
          doc.text(`$${(item.total / 100).toFixed(2)}`, totalX, y);
          y += 20;
        }

        doc.moveTo(50, y).lineTo(550, y).stroke();
        y += 10;

        // Totals
        doc.text('Subtotal:', 370, y);
        doc.text(`$${(data.subtotal / 100).toFixed(2)}`, totalX, y);
        y += 20;

        if (data.tax > 0) {
          doc.text('Tax:', 370, y);
          doc.text(`$${(data.tax / 100).toFixed(2)}`, totalX, y);
          y += 20;
        }

        doc.font('Helvetica-Bold');
        doc.text('Total:', 370, y);
        doc.text(`$${(data.total / 100).toFixed(2)}`, totalX, y);

        // Payment link if provided
        if (data.paymentLink) {
          doc.moveDown(3);
          doc.font('Helvetica');
          doc.fontSize(12).text('Payment Link:', { align: 'center' });
          doc.fontSize(10).fillColor('blue');
          doc.text(data.paymentLink, { align: 'center', link: data.paymentLink });
          doc.fillColor('black');
        }

        // Footer
        doc.fontSize(8).fillColor('gray');
        const footerY = doc.page.height - 50;
        doc.text('Thank you for your business!', 50, footerY, { align: 'center' });

        doc.end();

        writeStream.on('finish', () => {
          const stats = fs.statSync(filePath);
          this.logger.log(`PDF generated: ${filePath} (${stats.size} bytes)`);
          
          resolve({
            filePath,
            fileName,
            size: stats.size,
          });
        });

        writeStream.on('error', (error: Error) => {
          this.logger.error(`Failed to write PDF: ${error.message}`);
          reject(error);
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to generate PDF: ${errorMessage}`, error);
        reject(error);
      }
    });
  }

  async generatePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Simplified PDF content for buffer
        doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).font('Helvetica');
        doc.text(`Invoice: ${data.invoiceNumber}`);
        doc.text(`Customer: ${data.customerName}`);
        doc.text(`Amount: $${(data.total / 100).toFixed(2)}`);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  deletePdf(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted PDF: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete PDF: ${error}`);
    }
  }
}
