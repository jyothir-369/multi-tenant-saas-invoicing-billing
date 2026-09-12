import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService, DashboardBalance, OverviewResponse } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('balance')
  getBalance(): Promise<DashboardBalance> { return this.service.getBalance(); }

  @Get('overview')
  getOverview(@Query('range') range = 'this_month'): Promise<OverviewResponse> {
    const allowed = ['this_month', 'last_30d', 'this_quarter', 'ytd', 'all'];
    if (!allowed.includes(range)) return this.service.getOverview('this_month');
    return this.service.getOverview(range);
  }
}