import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: any;
    role: any;
    refreshToken: any;
    passwordResetToken: any;
    $transaction: any;
  };
  let jwt: JwtService;
  let config: ConfigService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      role: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      passwordResetToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') } as unknown as JwtService;
    config = {
      get: jest.fn((key: string, fallback?: unknown) => fallback),
      getOrThrow: jest.fn(() => 'test-secret'),
    } as unknown as ConfigService;

    service = new AuthService(prisma as unknown as PrismaService, jwt, config);
  });

  describe('register', () => {
    it('throws ConflictException when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'taken@example.com',
          password: 'password123',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hashes the password and creates the user with the CUSTOMER role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'role-customer', name: RoleName.CUSTOMER });
      prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'new@example.com' });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'A',
        lastName: 'B',
      });

      expect(prisma.user.create).toHaveBeenCalled();
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(await argon2.verify(createArgs.data.passwordHash, 'password123')).toBe(true);
      expect(result.tokens.accessToken).toBe('signed.jwt.token');
      expect(result.tokens.refreshToken).toBeDefined();
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException on wrong password', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        passwordHash,
        isActive: true,
        deletedAt: null,
        roles: [],
      });

      await expect(
        service.login({ email: 'a@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the account is inactive', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        passwordHash,
        isActive: false,
        deletedAt: null,
        roles: [],
      });

      await expect(
        service.login({ email: 'a@example.com', password: 'correct-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues tokens on valid credentials', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        passwordHash,
        isActive: true,
        deletedAt: null,
        roles: [{ role: { name: RoleName.CUSTOMER } }],
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({ email: 'a@example.com', password: 'correct-password' });
      expect(result.tokens.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('refresh', () => {
    it('rejects an unknown or revoked refresh token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);
      await expect(service.refresh('bogus-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
