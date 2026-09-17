import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { EmailModule } from '../email/email.module';

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

@Module({
  imports: [PassportModule, JwtModule.register({}), EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleAuthGuard,
    ...(googleConfigured ? [GoogleStrategy] : []),
  ],
  exports: [AuthService],
})
export class AuthModule {}
