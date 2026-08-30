import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant-context.service';
import { CreateUserDto, UpdateUserDto, UpdateUserRoleDto } from './dto';
import { UserRole, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export interface UserWithRole extends Omit<User, 'passwordHash'> {
  passwordHash?: never;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not available');
    }
    return tenantId;
  }

  async create(dto: CreateUserDto): Promise<UserWithRole> {
    const tenantId = this.getTenantId();

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists in this tenant');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: UserRole.STAFF,
        tenantId,
      },
    });

    return this.sanitizeUser(user);
  }

  async findAll(): Promise<UserWithRole[]> {
    const tenantId = this.getTenantId();

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  async findOne(id: string): Promise<UserWithRole> {
    const tenantId = this.getTenantId();

    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.sanitizeUser(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserWithRole> {
    const tenantId = this.getTenantId();

    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const updateData: any = {};
    if (dto.email) {
      // Check if email is already taken
      const existingUser = await this.prisma.user.findFirst({
        where: { email: dto.email, tenantId, id: { not: id } },
      });

      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
      updateData.email = dto.email;
    }

    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    return this.sanitizeUser(updatedUser);
  }

  async updateRole(
    id: string,
    dto: UpdateUserRoleDto,
    requestingUserId: string,
  ): Promise<UserWithRole> {
    const tenantId = this.getTenantId();

    // Prevent changing own role
    if (id === requestingUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Prevent demoting the last owner
    if (user.role === UserRole.OWNER && dto.role !== UserRole.OWNER) {
      const ownerCount = await this.prisma.user.count({
        where: { tenantId, role: UserRole.OWNER },
      });

      if (ownerCount <= 1) {
        throw new ForbiddenException('Cannot demote the last owner');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
    });

    return this.sanitizeUser(updatedUser);
  }

  async delete(id: string, requestingUserId: string): Promise<void> {
    const tenantId = this.getTenantId();

    if (id === requestingUserId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Prevent deleting the last owner
    if (user.role === UserRole.OWNER) {
      const ownerCount = await this.prisma.user.count({
        where: { tenantId, role: UserRole.OWNER },
      });

      if (ownerCount <= 1) {
        throw new ForbiddenException('Cannot delete the last owner');
      }
    }

    await this.prisma.user.delete({
      where: { id },
    });
  }

  private sanitizeUser(user: User): UserWithRole {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
