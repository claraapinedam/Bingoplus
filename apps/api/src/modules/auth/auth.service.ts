import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { parseDurationMs } from './utils/duration.util';

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

    const emailConfigured = Boolean(this.config.get('EMAIL_API_KEY'));
    if (!emailConfigured) {
      this.logger.warn(
        `EMAIL_API_KEY is not configured — password reset link was generated but NOT sent. ` +
          `(dev only) reset token for ${email}: ${rawToken}`,
      );
      return;
    }

    // TODO(Phase 8): send via NotificationService once an email provider is wired up.
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
