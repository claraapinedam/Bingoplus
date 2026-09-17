import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { EMAIL_PROVIDER_TOKEN } from './providers/email-provider.interface';
import { SandboxEmailProvider } from './providers/sandbox-email.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';

const logger = new Logger('EmailModule');

@Module({
  providers: [
    EmailService,
    SandboxEmailProvider,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: (config: ConfigService, sandbox: SandboxEmailProvider, resend: ResendEmailProvider) => {
        if (!config.get<string>('RESEND_API_KEY')) {
          logger.warn('Using SandboxEmailProvider — RESEND_API_KEY is not set, no real email will be sent.');
          return sandbox;
        }
        return resend;
      },
      inject: [ConfigService, SandboxEmailProvider, ResendEmailProvider],
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
