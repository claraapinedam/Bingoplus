import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleAuthGuard, GoogleAppParam } from './guards/google-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { toUserDto } from '../users/dto/user.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const { user, tokens } = await this.authService.register(dto);
    return { user: toUserDto(user, ['CUSTOMER']), ...tokens };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const { user, tokens } = await this.authService.login(dto);
    return {
      user: toUserDto(
        user,
        (user as any).roles.map((r: any) => r.role.name),
      ),
      ...tokens,
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefreshTokenDto) {
    await this.authService.logout(user.id, dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Handled by GoogleAuthGuard — redirects to Google's consent screen.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const { tokens } = await this.authService.loginOrRegisterSocial(req.user as any);
    // `state` is the same `app` value GoogleAuthGuard.getAuthenticateOptions sent to Google —
    // it round-trips unmodified, which is how one shared GOOGLE_OAUTH_CALLBACK_URL still sends
    // the browser back to whichever of the 4 apps actually started the flow.
    const state = req.query.state as GoogleAppParam | undefined;
    const appUrl =
      {
        customer: this.config.get<string>('CUSTOMER_APP_URL'),
        rider: this.config.get<string>('RIDER_APP_URL'),
        business: this.config.get<string>('BUSINESS_APP_URL'),
        admin: this.config.get<string>('ADMIN_APP_URL'),
      }[state ?? 'customer'] ?? this.config.get<string>('CUSTOMER_APP_URL');
    // Frontend completes the session by reading these from the redirect query string.
    res.redirect(`${appUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  }
}
