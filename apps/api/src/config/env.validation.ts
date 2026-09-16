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

  @IsString()
  @IsOptional()
  EMAIL_API_KEY?: string;

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
