import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: any;
    role: any;
    refreshToken: any;
    passwordResetToken: any;
    otpCode: any;
    $transaction: any;
  };
  let jwt: JwtService;
  let config: ConfigService;
  let email: { sendPasswordResetEmail: jest.Mock; sendVerificationEmail: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      role: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      passwordResetToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      otpCode: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') } as unknown as JwtService;
    config = {
      get: jest.fn((key: string, fallback?: unknown) => fallback),
      getOrThrow: jest.fn(() => 'test-secret'),
    } as unknown as ConfigService;
    email = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      email as unknown as EmailService,
    );
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
          termsAccepted: true,
          privacyNoticeAccepted: true,
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
        termsAccepted: true,
        privacyNoticeAccepted: true,
      });

      expect(prisma.user.create).toHaveBeenCalled();
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(await argon2.verify(createArgs.data.passwordHash, 'password123')).toBe(true);
      expect(result.tokens.accessToken).toBe('signed.jwt.token');
      expect(result.tokens.refreshToken).toBeDefined();
      expect(email.sendVerificationEmail).toHaveBeenCalledWith('new@example.com', expect.any(String));
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

  describe('forgotPassword', () => {
    it('silently no-ops for an unknown email without sending anything', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword('missing@example.com');

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates a reset token and emails a reset link for a known user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@example.com' });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword('a@example.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(email.sendPasswordResetEmail).toHaveBeenCalledWith(
        'a@example.com',
        expect.stringContaining('/reset-password?token='),
      );
    });
  });

  describe('verifyEmail', () => {
    it('throws for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('missing@example.com', '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('no-ops when the account is already verified', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isEmailVerified: true });

      await service.verifyEmail('a@example.com', '123456');

      expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    });

    it('throws for a wrong code and increments attempts', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@example.com', isEmailVerified: false });
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: 'not-a-match',
        attempts: 0,
      });

      await expect(service.verifyEmail('a@example.com', '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('marks the user verified and consumes the code on a correct match', async () => {
      const codeHash = createHash('sha256').update('654321').digest('hex');
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@example.com', isEmailVerified: false });
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp-1', codeHash, attempts: 0 });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      await service.verifyEmail('a@example.com', '654321');

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('resendVerificationEmail', () => {
    it('no-ops for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.resendVerificationEmail('missing@example.com');

      expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('no-ops when already verified', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@example.com', isEmailVerified: true });

      await service.resendVerificationEmail('a@example.com');

      expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('sends a fresh code for an unverified user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@example.com', isEmailVerified: false });

      await service.resendVerificationEmail('a@example.com');

      expect(prisma.otpCode.updateMany).toHaveBeenCalled();
      expect(prisma.otpCode.create).toHaveBeenCalled();
      expect(email.sendVerificationEmail).toHaveBeenCalledWith('a@example.com', expect.any(String));
    });
  });
});
