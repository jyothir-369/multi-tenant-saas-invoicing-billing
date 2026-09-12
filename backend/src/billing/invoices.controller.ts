import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { InvoicesService, InvoiceWithDetails } from './invoices.service';
import { CreateInvoiceDto, UpdateInvoiceDto, CreateLineItemDto, UpdateLineItemDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { InvoiceStatus } from '@prisma/client';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: CurrentUserData): Promise<InvoiceWithDetails> {
    return this.invoicesService.create(dto);
  }

  @Get()
  async findAll(@Query() query: any): Promise<{ data: InvoiceWithDetails[]; total: number }> {
    const status = query.status ? (query.status as InvoiceStatus) : undefined;
    return this.invoicesService.findAll({
      status,
      search: query.search,
      sort: query.sort,
      order: query.order,
      page: query.page ? parseInt(query.page, 10) : 1,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : 20,
    });
  }

  @Get('tab-counts')
  async getTabCounts(@CurrentUser() user: CurrentUserData): Promise<Record<string, number>> {
    return this.invoicesService.getTabCounts();
  }

  @Get('dashboard')
  async getDashboardBalance(@CurrentUser() user: CurrentUserData): Promise<{ outstanding: number; overdue: number; paidThisMonth: number }> {
    return this.invoicesService.getDashboardBalance();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto): Promise<InvoiceWithDetails> {
    return this.invoicesService.update(id, dto);
  }

  @Post(':id/line-items')
  async addLineItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLineItemDto): Promise<InvoiceWithDetails> {
    return this.invoicesService.addLineItem(id, dto);
  }

  @Patch(':id/line-items/:lineItemId')
  async updateLineItem(@Param('id', ParseUUIDPipe) id: string, @Param('lineItemId', ParseUUIDPipe) lineItemId: string, @Body() dto: UpdateLineItemDto): Promise<InvoiceWithDetails> {
    return this.invoicesService.updateLineItem(id, lineItemId, dto);
  }

  @Delete(':id/line-items/:lineItemId')
  async deleteLineItem(@Param('id', ParseUUIDPipe) id: string, @Param('lineItemId', ParseUUIDPipe) lineItemId: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.deleteLineItem(id, lineItemId);
  }

  @Post(':id/mark-sent')
  async send(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.send(id);
  }

  @Post(':id/mark-overdue')
  async markOverdue(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.markOverdue(id);
  }

  @Post(':id/mark-paid')
  async markPaid(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceWithDetails> {
    return this.invoicesService.markPaid(id);
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
