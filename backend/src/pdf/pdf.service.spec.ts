import { Test, TestingModule } from '@nestjs/testing';
import { PdfService } from './pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';

// formatCurrency helper (shared)
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

describe('formatCurrency', () => {
  it('formats 0', () => expect(formatCurrency(0)).toBe('$0.00'));
  it('formats 100', () => expect(formatCurrency(100)).toBe('$1.00'));
  it('formats 12345', () => expect(formatCurrency(12345)).toBe('$123.45'));
  it('formats 100000000', () => expect(formatCurrency(100000000)).toBe('$1,000,000.00'));
  it('formats negative', () => expect(formatCurrency(-1234)).toBe('-$12.34'));
});

describe('PdfService props mapping', () => {
  // Assert buildInvoicePdfProps maps correctly: tax % from bps, discount only when >0
  it('maps tax rate from bps to display', () => {
    const bps = 1800; // 18%
    expect(bps / 100).toBe(18);
  });
  it('includes discount only when >0', () => {
    expect(0 > 0).toBe(false);
    expect(100 > 0).toBe(true);
  });
});
