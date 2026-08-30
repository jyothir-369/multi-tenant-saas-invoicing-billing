import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let authService: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    tenant: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'password123',
      tenantName: 'Test Company',
    };

    it('should successfully register a new user and create a tenant', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1', name: 'Test Company', plan: 'free' }) },
          user: { create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com', role: UserRole.OWNER, tenantId: 'tenant-1' }) },
        };
        return callback(tx);
      });

      const result = await authService.register(registerDto);

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result.user).toHaveProperty('email', 'test@example.com');
      expect(result.user).toHaveProperty('role', UserRole.OWNER);
      expect(result.user).toHaveProperty('tenantId', 'tenant-1');
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'test@example.com',
        tenantId: 'tenant-1',
        role: UserRole.OWNER,
      });
    });

    it('should throw ConflictException if user already exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'existing-user', email: 'test@example.com' });

      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(authService.register(registerDto)).rejects.toThrow('User with this email already exists');
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: '',
      role: UserRole.OWNER,
      tenantId: 'tenant-1',
      tenant: { id: 'tenant-1', name: 'Test Company' },
    };

    it('should successfully login and return access token', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      const hash = await bcrypt.hash('password123', 10);
      mockUser.passwordHash = hash;

      const result = await authService.login(loginDto);

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result.user).toHaveProperty('email', 'test@example.com');
      expect(result.user).toHaveProperty('tenantId', 'tenant-1');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(authService.login(loginDto)).rejects.toThrow('Invalid credentials');
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const hash = await bcrypt.hash('differentpassword', 10);
      mockUser.passwordHash = hash;
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(authService.login(loginDto)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getProfile', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      role: UserRole.OWNER,
      tenantId: 'tenant-1',
      tenant: { id: 'tenant-1', name: 'Test Company' },
    };

    it('should return user profile', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.getProfile('user-1');

      expect(result).toHaveProperty('id', 'user-1');
      expect(result).toHaveProperty('email', 'test@example.com');
      expect(result).toHaveProperty('tenantName', 'Test Company');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(authService.getProfile('non-existent-id')).rejects.toThrow(UnauthorizedException);
      await expect(authService.getProfile('non-existent-id')).rejects.toThrow('User not found');
    });
  });
});
