import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService, UserWithRole } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdateUserRoleDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async findAll(): Promise<UserWithRole[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async findOne(@Param('id') id: string): Promise<UserWithRole> {
    return this.usersService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async create(@Body() dto: CreateUserDto): Promise<UserWithRole> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserWithRole> {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Request() req: any,
  ): Promise<UserWithRole> {
    return this.usersService.updateRole(id, dto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async delete(@Param('id') id: string, @Request() req: any): Promise<void> {
    return this.usersService.delete(id, req.user.id);
  }
}
