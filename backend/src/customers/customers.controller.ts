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
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { CustomersService, CustomerWithBalance } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto, CreateNoteDto, UpdateNoteDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  async create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<CustomerWithBalance> {
    return this.customersService.create(dto);
  }

  @Get()
  async findAll(
    @Query('includeArchived') includeArchived?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: CustomerWithBalance[]; total: number }> {
    return this.customersService.findAll({
      includeArchived: includeArchived === 'true',
      search,
      sort,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerWithBalance> {
    return this.customersService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerWithBalance> {
    return this.customersService.update(id, dto);
  }

  @Post(':id/archive')
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerWithBalance> {
    return this.customersService.archive(id);
  }

  @Post(':id/unarchive')
  async unarchive(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerWithBalance> {
    return this.customersService.unarchive(id);
  }

  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customersService.delete(id);
  }

  // Notes
  @Get(':id/notes')
  async listNotes(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.listNotes(id);
  }

  @Post(':id/notes')
  async createNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.customersService.createNote(id, dto, user.id);
  }

  @Put(':id/notes/:noteId')
  async updateNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.customersService.updateNote(id, noteId, dto);
  }

  @Delete(':id/notes/:noteId')
  async deleteNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.customersService.deleteNote(id, noteId);
  }

  // Invoices for customer
  @Get(':id/invoices')
  async listInvoices(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.listInvoices(id, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  // Payments for customer
  @Get(':id/payments')
  async listPayments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.listPayments(id, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  // Activity
  @Get(':id/activity')
  async getActivity(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.getActivity(id);
  }

  // CSV Export
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  async exportCSV(@Res() res: Response) {
    const csv = await this.customersService.exportCSV();
    res.send(csv);
  }
}
