import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown whenever an endpoint depends on a third-party integration (Maps, Payments, social
 * login, notifications) whose required environment variables are not set. The API must never
 * fake a successful integration — this is the single, consistent way every module reports
 * "not configured yet" instead of silently no-op'ing or inventing data.
 */
export class IntegrationNotConfiguredException extends HttpException {
  constructor(integration: string, missingVars: string[]) {
    super(
      {
        error: {
          code: 'INTEGRATION_NOT_CONFIGURED',
          message: `${integration} is not configured on this environment.`,
          details: [{ missingEnvironmentVariables: missingVars }],
        },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
