import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TenantsService, TenantStats } from './tenants.service';
import { UpdateTenantDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, Tenant } from '@prisma/client';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  async getCurrentTenant(@Request() req: any): Promise<Tenant> {
    return this.tenantsService.findOne(req.user.tenantId);
  }

  @Patch('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async updateCurrentTenant(
    @Request() req: any,
    @Body() dto: UpdateTenantDto,
  ): Promise<Tenant> {
    return this.tenantsService.update(dto, req.user.tenantId);
  }

  @Get('me/stats')
  async getCurrentTenantStats(@Request() req: any): Promise<TenantStats> {
    return this.tenantsService.getStats(req.user.tenantId);
  }
}
