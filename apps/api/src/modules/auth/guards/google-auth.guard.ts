import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { IntegrationNotConfiguredException } from '../../../common/exceptions/integration-not-configured.exception';

/**
 * Wraps passport's 'google' strategy so an unconfigured environment fails with a clear 503
 * (IntegrationNotConfiguredException) instead of a raw "Unknown authentication strategy" crash —
 * the strategy itself is only registered by AuthModule when GOOGLE_CLIENT_ID/SECRET are present.
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
}
