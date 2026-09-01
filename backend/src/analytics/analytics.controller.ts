import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}
  @Get() get(@Query('range') range?: string) { return this.service.get(range); }
}
