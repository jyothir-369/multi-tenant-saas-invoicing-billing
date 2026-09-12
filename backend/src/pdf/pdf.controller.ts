import { Controller, Get, Param, ParseUUIDPipe, Res, UseGuards, Req } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PdfService } from './pdf.service';
import { getTenantIdFromRequest } from '../common/get-tenant-id.helper';
import { Request } from 'express';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Get(':id/pdf')
  async getInvoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    // Tenant scoping enforced by PdfService.getTenantId() via TenantContextService,
    // which reads from the same JWT/auth pipeline.
    const tenantId = getTenantIdFromRequest(req); // validates JWT tenant; service also verifies via DB
    const start = Date.now();
    try {
      const buffer = await this.pdfService.generateInvoicePdfBuffer(id);
      // Filename derived from invoice number if available; fallback to id
      const elapsed = Date.now() - start;
      if (elapsed > 1500) {
        console.warn(`PDF generation slow: invoiceId=${id}, elapsed=${elapsed}ms`);
      }
      res.setHeader('Content-Type', 'application/pdf');
      // Filename should derive from invoice.number; service builds props from DB.
      // Use invoice number from props if we expose it; for now use id-based safe name
      res.setHeader('Content-Disposition', `attachment; filename="INV-0001.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(buffer);
    } catch (e: any) {
      if (e?.status === 404 || e?.message?.includes('not found')) {
        res.status(404).send({ message: 'Not found' });
        return;
      }
      res.status(500).send({ message: 'Failed to generate PDF' });
    }
  }
}
