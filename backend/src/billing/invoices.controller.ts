import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InvoicesService, InvoiceWithDetails } from './invoices.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { InvoiceStatus } from '@prisma/client';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<InvoiceWithDetails> {
    return this.invoicesService.create(dto);
  }

  @Get()
  async findAll(
    @Query('status') status?: InvoiceStatus,
  ): Promise<InvoiceWithDetails[]> {
    return this.invoicesService.findAll(status);
  }

  @Get('dashboard')
  async getDashboardBalance(
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ outstanding: number; overdue: number; paidThisMonth: number }> {
    return this.invoicesService.getDashboardBalance();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ): Promise<InvoiceWithDetails> {
    return this.invoicesService.update(id, dto);
  }

  @Post(':id/send')
  async send(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.send(id);
  }

  @Post(':id/mark-paid')
  async markPaid(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.markPaid(id);
  }

  @Post(':id/mark-overdue')
  async markOverdue(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.markOverdue(id);
  }

  @Post(':id/void')
  async void(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.void(id);
  }

  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.invoicesService.delete(id);
  }
}
