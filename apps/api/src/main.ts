import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true (§22) — POST /payments/webhooks/:provider needs the exact raw bytes to verify
  // a provider's signature; the parsed JSON body alone isn't enough for that.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Render sits the app behind exactly one reverse proxy — without this, Express's own req.ip
  // reads the proxy's own connection (e.g. "::1"/loopback) instead of the real client IP from the
  // X-Forwarded-For header, silently breaking every feature that stamps req.ip for real (the
  // signed-contract audit trail's signedIp being the one that surfaced this — see
  // ContractsService.sign()/RiderContractsService's equivalent). "1" trusts exactly one hop,
  // matching Render's actual topology, rather than the whole X-Forwarded-For chain.
  app.set('trust proxy', 1);

  // Every uploaded photo/PDF (business logos, pet-friendly-place photos, signed contracts, …) is
  // served from this API and embedded as an <img>/<a> in a different app on a different port
  // (admin/business/customer/rider each run on their own port) — helmet's default
  // Cross-Origin-Resource-Policy: same-origin silently blocks the browser from loading those
  // (curl and the JSON API calls are unaffected, since CORP only governs no-cors resource loads
  // like <img>, not XHR/fetch, which is what app.enableCors() below actually governs).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const corsOrigin = config.get<string>('CORS_ORIGIN', '');
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true,
    credentials: true,
  });

  const apiPrefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BINGO+ API')
    .setDescription('Pet ecosystem marketplace — REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  logger.log(`BINGO+ API listening on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger docs at http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap();
