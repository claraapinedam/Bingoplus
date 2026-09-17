import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsString()
  API_PREFIX: string = 'api/v1';

  @IsString()
  DATABASE_URL!: string;

  // Only read by the Prisma Migrate engine (see schema.prisma's datasource block) — never by
  // NestJS/the generated Client, so it's optional here and simply unused when absent.
  @IsString()
  @IsOptional()
  DIRECT_URL?: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '15m';

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '30d';

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = '';

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  MAP_PROVIDER?: string;

  @IsString()
  @IsOptional()
  GOOGLE_MAPS_API_KEY?: string;

  @IsInt()
  @IsOptional()
  LOCATION_UPDATE_INTERVAL: number = 15000;

  @IsInt()
  @IsOptional()
  RIDER_ASSIGNMENT_TIMEOUT: number = 60;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  GOOGLE_OAUTH_CALLBACK_URL?: string;

  // Where GET /auth/google/callback sends the browser back to, per originating app — see the
  // `state` param threaded through GoogleAuthGuard. Each defaults to that app's local dev port so
  // this works out of the box without any of these being set.
  @IsString()
  @IsOptional()
  CUSTOMER_APP_URL: string = 'http://localhost:3002';

  @IsString()
  @IsOptional()
  RIDER_APP_URL: string = 'http://localhost:3003';

  @IsString()
  @IsOptional()
  BUSINESS_APP_URL: string = 'http://localhost:3005';

  @IsString()
  @IsOptional()
  ADMIN_APP_URL: string = 'http://localhost:3004';

  @IsString()
  @IsOptional()
  PAYMENT_PROVIDER?: string;

  @IsString()
  @IsOptional()
  PAYMENT_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  PAYMENT_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  CURRENCY: string = 'USD';

  @IsString()
  @IsOptional()
  STORAGE_BUCKET?: string;

  // Legacy placeholder — never wired to anything. RESEND_API_KEY below is the real one.
  @IsString()
  @IsOptional()
  EMAIL_API_KEY?: string;

  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  // Resend's own sandbox sender (works with zero domain verification) unless overridden.
  @IsString()
  @IsOptional()
  EMAIL_FROM_ADDRESS: string = 'onboarding@resend.dev';

  @IsString()
  @IsOptional()
  EMAIL_FROM_NAME: string = 'BINGO+';

  // BINGO+'s own counterpart signature block, stamped automatically on every business contract —
  // fictitious placeholder values until the real legal representative/RUC are provided (same
  // "sandbox until configured" shape as everything else in this file).
  @IsString()
  @IsOptional()
  BINGOPLUS_LEGAL_REPRESENTATIVE_NAME: string = 'Representante Legal BINGO+ (dato de prueba)';

  @IsString()
  @IsOptional()
  BINGOPLUS_LEGAL_RUC: string = '9999999999001';

  @IsString()
  @IsOptional()
  SMS_API_KEY?: string;

  @IsString()
  @IsOptional()
  PUSH_NOTIFICATION_KEY?: string;
}

/**
 * Fails app boot with a clear error if a required env var is missing, instead of starting
 * half-configured. Only DATABASE_URL / JWT_SECRET / JWT_REFRESH_SECRET are hard-required for
 * Phase 1 — every third-party integration key is optional and its absence is surfaced at the
 * feature boundary (see docs/09-external-integrations.md), not at boot.
 */
export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  return validated;
}
