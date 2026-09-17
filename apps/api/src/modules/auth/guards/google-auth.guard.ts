import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { IntegrationNotConfiguredException } from '../../../common/exceptions/integration-not-configured.exception';

export const GOOGLE_APP_PARAM_VALUES = ['customer', 'rider', 'business', 'admin'] as const;
export type GoogleAppParam = (typeof GOOGLE_APP_PARAM_VALUES)[number];

/**
 * Wraps passport's 'google' strategy so an unconfigured environment fails with a clear 503
 * (IntegrationNotConfiguredException) instead of a raw "Unknown authentication strategy" crash —
 * the strategy itself is only registered by AuthModule when GOOGLE_CLIENT_ID/SECRET are present.
 *
 * Also threads which of the 4 apps started the flow (GET /auth/google?app=customer) through
 * Google's own `state` round-trip param, since GOOGLE_OAUTH_CALLBACK_URL is a single fixed URL
 * shared by all 4 — AuthController.googleCallback reads it back to know which app to redirect to.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!this.config.get('GOOGLE_CLIENT_ID') || !this.config.get('GOOGLE_CLIENT_SECRET')) {
      throw new IntegrationNotConfiguredException('Google login', [
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_OAUTH_CALLBACK_URL',
      ]);
    }
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const app = GOOGLE_APP_PARAM_VALUES.includes(req.query?.app) ? req.query.app : 'customer';
    return { state: app };
  }
}
