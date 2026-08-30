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
import { CustomersService, CustomerWithBalance } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';
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
  ): Promise<CustomerWithBalance[]> {
    return this.customersService.findAll(includeArchived === 'true');
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
}
