import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService, AuthResponse } from '../auth.service';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';

describe('AuthController', () => {
  let authController: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    getProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    authController = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user and return access token', async () => {
      const registerDto = { email: 'test@example.com', password: 'password123', tenantName: 'Test Company' };
      const expectedResponse: AuthResponse = {
        accessToken: 'mock-jwt-token',
        user: { id: 'user-1', email: 'test@example.com', role: UserRole.OWNER, tenantId: 'tenant-1', tenantName: 'Test Company' },
      };
      mockAuthService.register.mockResolvedValue(expectedResponse);

      const result = await authController.register(registerDto);

      expect(result).toEqual(expectedResponse);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    it('should login and return access token', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const expectedResponse: AuthResponse = {
        accessToken: 'mock-jwt-token',
        user: { id: 'user-1', email: 'test@example.com', role: UserRole.OWNER, tenantId: 'tenant-1', tenantName: 'Test Company' },
      };
      mockAuthService.login.mockResolvedValue(expectedResponse);

      const result = await authController.login(loginDto);

      expect(result).toEqual(expectedResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const mockProfile = { id: 'user-1', email: 'test@example.com', role: UserRole.OWNER, tenantId: 'tenant-1', tenantName: 'Test Company' };
      mockAuthService.getProfile.mockResolvedValue(mockProfile);

      const result = await authController.getProfile({ user: { id: 'user-1' } });

      expect(result).toEqual(mockProfile);
      expect(authService.getProfile).toHaveBeenCalledWith('user-1');
    });
  });
});
