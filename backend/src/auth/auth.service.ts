import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto';
import * as bcrypt from 'bcryptjs';
import { UserRole, Tenant, User } from '@prisma/client';

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    tenantId: string;
    tenantName: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const { email, password, tenantName } = dto;

    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          plan: 'free',
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: UserRole.OWNER,
          tenantId: tenant.id,
        },
      });

      return { tenant, user };
    });

    const payload = {
      sub: result.user.id,
      email: result.user.email,
      tenantId: result.tenant.id,
      role: result.user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.tenant.id,
        tenantName: result.tenant.name,
      },
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const { email, password } = dto;

    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant.name,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
    };
  }
}
