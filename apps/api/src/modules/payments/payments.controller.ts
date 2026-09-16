import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/payment-method.dto';
import { SimulateSandboxWebhookDto } from './dto/simulate-sandbox-webhook.dto';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';

@ApiTags('payment-methods')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethods: PaymentMethodsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentMethods.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethods.create(user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentMethods.remove(user.id, id);
  }
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: { select: { userId: true } },
        booking: { select: { userId: true } },
        transactions: true,
        refunds: true,
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const ownerId = payment.order?.userId ?? payment.booking?.userId;
    if (ownerId !== user.id) throw new ForbiddenException('Not your payment');
    const { order, booking, ...rest } = payment;
    void order;
    void booking;
    return rest;
  }
}

/**
 * Dev-only tool while there is no real payment provider contract yet (§74): builds a correctly
 * signed webhook request for one of the caller's own payments, so hitting the real
 * `POST /payments/webhooks/sandbox` end-to-end — signature check, WebhookEvent idempotency, and
 * the Payment→Order sync — can be exercised without waiting on a gateway. Refuses outright in
 * production, independent of which PaymentProvider is actually wired (§75).
 */
@ApiTags('payments/sandbox')
@Controller('payments/sandbox')
export class SandboxWebhookSimulatorController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxPaymentProvider,
    private readonly config: ConfigService,
  ) {}

  @Post('simulate-webhook')
  async simulate(@CurrentUser() user: AuthenticatedUser, @Body() dto: SimulateSandboxWebhookDto) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException('The sandbox webhook simulator is disabled in production.');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: { order: { select: { userId: true } }, booking: { select: { userId: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const ownerId = payment.order?.userId ?? payment.booking?.userId;
    if (ownerId !== user.id) throw new ForbiddenException('Not your payment');
    if (!payment.providerPaymentId) throw new NotFoundException('This payment has no providerPaymentId yet');

    const { rawBody, signatureHeader } = this.sandbox.buildSimulatedWebhookRequest(
      payment.providerPaymentId,
      dto.status,
    );

    return {
      rawBody,
      signatureHeader,
      curlCommand:
        `curl -X POST http://localhost:3001/api/v1/payments/webhooks/sandbox ` +
        `-H "Content-Type: application/json" -H "x-webhook-signature: ${signatureHeader}" ` +
        `-d '${rawBody}'`,
    };
  }
}
