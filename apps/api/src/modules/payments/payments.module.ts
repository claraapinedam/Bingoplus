import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethodsController, PaymentsController, SandboxWebhookSimulatorController } from './payments.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentService } from './payment.service';
import { PAYMENT_PROVIDER_TOKEN } from './providers/payment-provider.interface';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';

const logger = new Logger('PaymentsModule');

@Module({
  controllers: [PaymentMethodsController, PaymentsController, SandboxWebhookSimulatorController],
  providers: [
    PaymentService,
    PaymentMethodsService,
    SandboxPaymentProvider,
    {
      provide: PAYMENT_PROVIDER_TOKEN,
      useFactory: (config: ConfigService, sandbox: SandboxPaymentProvider) => {
        const configuredProvider = config.get<string>('PAYMENT_PROVIDER');
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const usingSandbox = !configuredProvider || configuredProvider === 'sandbox';

        if (isProduction && usingSandbox) {
          // §75: never silently accept the sandbox in production — this is a boot-time
          // configuration error, not a soft warning that's easy to miss in log noise.
          throw new Error(
            'PAYMENT_PROVIDER is unset or "sandbox" while NODE_ENV=production. Refusing to start ' +
              'with a fake payment provider in production — set PAYMENT_PROVIDER to a real, ' +
              'configured provider.',
          );
        }
        if (usingSandbox) {
          logger.warn('Using SandboxPaymentProvider — no real payment processor is configured.');
          return sandbox;
        }
        // §18: only Sandbox is implemented in this phase; a real provider name is accepted at
        // the config level (so env/deploy scripts can be written ahead of time) but not wired.
        throw new Error(
          `PAYMENT_PROVIDER="${configuredProvider}" has no implementation yet — only "sandbox" is available in FASE 3.`,
        );
      },
      inject: [ConfigService, SandboxPaymentProvider],
    },
  ],
  exports: [PaymentService, PaymentMethodsService, PAYMENT_PROVIDER_TOKEN],
})
export class PaymentsModule {}
