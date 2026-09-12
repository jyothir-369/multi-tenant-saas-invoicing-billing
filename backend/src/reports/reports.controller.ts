import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('revenue')
  async revenue(@Query('range') range?: string) {
    return this.service.revenue(range || 'this_month');
  }

  @Get('revenue/export.csv')
  async revenueExport(@Res() res: Response, @Query('range') range?: string) {
    const csv = await this.service.revenueCSV(range || 'this_month');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue.csv"');
    res.send(csv);
  }

  @Get('outstanding')
  async outstanding(@Query('range') range?: string) {
    return this.service.outstanding(range || 'this_month');
  }

  @Get('outstanding/export.csv')
  async outstandingExport(@Res() res: Response, @Query('range') range?: string) {
    const csv = await this.service.outstandingCSV(range || 'this_month');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="outstanding.csv"');
    res.send(csv);
  }

  @Get('aging')
  async aging() {
    return this.service.aging();
  }

  @Get('aging/export.csv')
  async agingExport(@Res() res: Response) {
    const csv = await this.service.agingCSV();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aging.csv"');
    res.send(csv);
  }

  @Get('customers')
  async customers(@Query('range') range?: string) {
    return this.service.customers(range || 'this_month');
  }

  @Get('customers/export.csv')
  async customersExport(@Res() res: Response, @Query('range') range?: string) {
    const csv = await this.service.customersCSV(range || 'this_month');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(csv);
  }
}
