import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose, RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { parseDurationMs } from './utils/duration.util';

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const customerRole = await this.prisma.role.findUnique({
      where: { name: RoleName.CUSTOMER },
    });
    if (!customerRole) {
      throw new Error('CUSTOMER role is not seeded — run prisma db seed');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        roles: { create: { roleId: customerRole.id } },
      },
    });

    await this.sendVerificationCode(user.id, user.email);

    return { user, tokens: await this.issueTokens(user.id, user.email, [RoleName.CUSTOMER]) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });

    if (!user || !user.passwordHash || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('This account is inactive');
    }

    const roles = user.roles.map((r) => r.role.name);
    return { user, tokens: await this.issueTokens(user.id, user.email, roles) };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('This account is inactive');
    }

    const roles = user.roles.map((r) => r.role.name);
    return this.issueTokens(user.id, user.email, roles);
  }

  async logout(userId: string, refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Never reveal whether an email exists — always respond the same way.
    if (!user) {
      this.logger.log(`Password reset requested for unknown email ${email} (no-op)`);
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Forgot-password only ships on the Customer app today (see its login page) — the reset
    // link always lands there regardless of which BINGO+ app the request came from.
    const customerAppUrl = this.config.get<string>('CUSTOMER_APP_URL', 'http://localhost:3002');
    const resetUrl = `${customerAppUrl}/reset-password?token=${rawToken}`;
    await this.email.sendPasswordResetEmail(email, resetUrl);
  }

  /** Consumes a VERIFY_EMAIL OtpCode and flips the account over — the one way isEmailVerified
   * ever becomes true for a password-registered account (Google sign-in sets it directly since
   * Google already verified the address). */
  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    if (user.isEmailVerified) {
      return;
    }

    const otp = await this.prisma.otpCode.findFirst({
      where: { destination: email, purpose: OtpPurpose.VERIFY_EMAIL, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (otp.codeHash !== this.hashToken(code)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Invalid or expired verification code');
    }

    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({ where: { id: user.id }, data: { isEmailVerified: true } }),
    ]);
  }

  /** Silently no-ops for an unknown or already-verified email — same "never reveal account
   * existence" posture as forgotPassword. */
  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isEmailVerified) {
      return;
    }
    await this.sendVerificationCode(user.id, user.email);
  }

  private async sendVerificationCode(userId: string, email: string) {
    // Only one live code per address at a time — a resend must invalidate whatever was sent before.
    await this.prisma.otpCode.updateMany({
      where: { destination: email, purpose: OtpPurpose.VERIFY_EMAIL, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = String(randomInt(100000, 1000000));
    await this.prisma.otpCode.create({
      data: {
        userId,
        destination: email,
        purpose: OtpPurpose.VERIFY_EMAIL,
        codeHash: this.hashToken(code),
        expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
      },
    });

    await this.email.sendVerificationEmail(email, code);
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!stored) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** Finds or creates a user from a verified Google profile, then issues tokens like a normal login. */
  async loginOrRegisterSocial(profile: {
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  }) {
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      const customerRole = await this.prisma.role.findUnique({
        where: { name: RoleName.CUSTOMER },
      });
      if (!customerRole) {
        throw new Error('CUSTOMER role is not seeded — run prisma db seed');
      }
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          avatarUrl: profile.avatarUrl,
          isEmailVerified: true,
          roles: { create: { roleId: customerRole.id } },
        },
        include: { roles: { include: { role: true } } },
      });
    }

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('This account is inactive');
    }

    const roles = user.roles.map((r) => r.role.name);
    return { user, tokens: await this.issueTokens(user.id, user.email, roles) };
  }

  private async issueTokens(userId: string, email: string, roles: RoleName[]): Promise<AuthTokens> {
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '15m');
    const accessToken = this.jwt.sign(
      { sub: userId, email, roles },
      { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn },
    );

    const rawRefreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + parseDurationMs(refreshExpiresIn)),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: Math.floor(parseDurationMs(expiresIn) / 1000),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
