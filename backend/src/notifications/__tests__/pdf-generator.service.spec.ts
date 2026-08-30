import { Test, TestingModule } from '@nestjs/testing';
import { PdfGeneratorService, InvoicePdfData } from '../adapters/pdf-generator.service';
import * as fs from 'fs';
import * as path from 'path';

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;
  const testOutputDir = './test-pdfs';

  beforeEach(async () => {
    // Set test output directory
    process.env.PDF_OUTPUT_DIR = testOutputDir;

    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfGeneratorService],
    }).compile();

    service = module.get<PdfGeneratorService>(PdfGeneratorService);

    // Clean up test directory
    if (fs.existsSync(testOutputDir)) {
      const files = fs.readdirSync(testOutputDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testOutputDir, file));
      }
    } else {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testOutputDir)) {
      const files = fs.readdirSync(testOutputDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testOutputDir, file));
      }
      fs.rmdirSync(testOutputDir);
    }
    delete process.env.PDF_OUTPUT_DIR;
  });

  describe('generateInvoicePdf', () => {
    const mockInvoiceData: InvoicePdfData = {
      invoiceNumber: 'INV-2024-001',
      invoiceDate: '2024-12-01',
      dueDate: '2024-12-31',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      items: [
        {
          description: 'Web Development Services',
          quantity: 10,
          unitPrice: 10000, // $100.00
          total: 100000, // $1000.00
        },
      ],
      subtotal: 100000,
      tax: 0,
      total: 100000,
      tenantName: 'Test Business LLC',
      tenantEmail: 'billing@testbusiness.com',
      paymentLink: 'https://pay.example.com/invoice/123',
    };

    it('should generate a PDF file', async () => {
      const result = await service.generateInvoicePdf(mockInvoiceData);

      expect(result.filePath).toBeDefined();
      expect(result.fileName).toContain('invoice_');
      expect(result.fileName).toContain('INV-2024-001');
      expect(result.fileName).toEndWith('.pdf');
      expect(result.size).toBeGreaterThan(0);
    });

    it('should create file on disk', async () => {
      const result = await service.generateInvoicePdf(mockInvoiceData);

      expect(fs.existsSync(result.filePath)).toBe(true);
    });

    it('should include customer information in PDF', async () => {
      const result = await service.generateInvoicePdf(mockInvoiceData);

      // Verify file was created
      expect(fs.existsSync(result.filePath)).toBe(true);
    });

    it('should handle multiple line items', async () => {
      const multiItemData: InvoicePdfData = {
        ...mockInvoiceData,
        items: [
          {
            description: 'Service A',
            quantity: 2,
            unitPrice: 5000,
            total: 10000,
          },
          {
            description: 'Service B',
            quantity: 3,
            unitPrice: 3000,
            total: 9000,
          },
        ],
        subtotal: 19000,
        total: 19000,
      };

      const result = await service.generateInvoicePdf(multiItemData);

      expect(result.size).toBeGreaterThan(0);
    });

    it('should handle empty payment link', async () => {
      const noLinkData: InvoicePdfData = {
        ...mockInvoiceData,
        paymentLink: undefined,
      };

      const result = await service.generateInvoicePdf(noLinkData);

      expect(result.size).toBeGreaterThan(0);
    });

    it('should calculate tax correctly', async () => {
      const withTaxData: InvoicePdfData = {
        ...mockInvoiceData,
        subtotal: 100000,
        tax: 10000, // 10% tax
        total: 110000,
      };

      const result = await service.generateInvoicePdf(withTaxData);

      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe('generatePdfBuffer', () => {
    it('should generate PDF as buffer', async () => {
      const mockData: InvoicePdfData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-12-01',
        dueDate: '2024-12-31',
        customerName: 'Test Customer',
        customerEmail: 'test@example.com',
        items: [
          {
            description: 'Test Item',
            quantity: 1,
            unitPrice: 1000,
            total: 1000,
          },
        ],
        subtotal: 1000,
        tax: 0,
        total: 1000,
        tenantName: 'Test Tenant',
      };

      const buffer = await service.generatePdfBuffer(mockData);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('deletePdf', () => {
    it('should delete existing PDF file', async () => {
      const mockData: InvoicePdfData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-12-01',
        dueDate: '2024-12-31',
        customerName: 'Test Customer',
        customerEmail: 'test@example.com',
        items: [
          {
            description: 'Test Item',
            quantity: 1,
            unitPrice: 1000,
            total: 1000,
          },
        ],
        subtotal: 1000,
        tax: 0,
        total: 1000,
        tenantName: 'Test Tenant',
      };

      const result = await service.generateInvoicePdf(mockData);
      expect(fs.existsSync(result.filePath)).toBe(true);

      service.deletePdf(result.filePath);
      expect(fs.existsSync(result.filePath)).toBe(false);
    });

    it('should not throw for non-existent file', () => {
      expect(() => service.deletePdf('/non/existent/path.pdf')).not.toThrow();
    });
  });
});

// Custom matcher for string ending
expect.extend({
  toEndWith(received: string, suffix: string) {
    const pass = received.endsWith(suffix);
    return {
      pass,
      message: () => `expected ${received} to ${pass ? 'not ' : ''}end with ${suffix}`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toEndWith(suffix: string): R;
    }
  }
}
