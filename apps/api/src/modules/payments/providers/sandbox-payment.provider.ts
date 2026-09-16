import { randomUUID, createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreatePaymentInput,
  CreatePaymentResult,
  ParsedWebhookEvent,
  PaymentProvider,
  ProviderStatusResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from './payment-provider.interface';

export interface SimulatedWebhookRequest {
  rawBody: string;
  signatureHeader: string;
}

/**
 * §18/74: no real gateway involved — every "confirmation" is deterministic and local. Never used
 * for Directory coupons (they have no Payment at all). §75: never selected when
 * NODE_ENV=production without an explicit acknowledgement — see PaymentsModule.
 */
@Injectable()
export class SandboxPaymentProvider extends PaymentProvider {
  readonly name = 'sandbox';
  private readonly logger = new Logger('SandboxPaymentProvider');

  constructor(private readonly config: ConfigService) {
    super();
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    void input;
    return {
      providerPaymentId: `sandbox_${randomUUID()}`,
      clientSecret: `sandbox_secret_${randomUUID()}`,
      status: 'PENDING',
    };
  }

  async confirmPayment(
    providerPaymentId: string,
    simulate?: 'success' | 'failure',
  ): Promise<ProviderStatusResult> {
    void providerPaymentId;
    return { status: simulate === 'failure' ? 'FAILED' : 'PAID' };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderStatusResult> {
    void providerPaymentId;
    // Sandbox keeps no server-side state of its own — the real status of record always lives on
    // our own Payment row; this exists only to satisfy the interface a real provider needs.
    return { status: 'PAID' };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    void input;
    return { providerRefundId: `sandbox_refund_${randomUUID()}`, status: 'COMPLETED' };
  }

  private webhookSecret(): string | undefined {
    return this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = this.webhookSecret();
    if (!secret) {
      this.logger.warn('PAYMENT_WEBHOOK_SECRET not set — rejecting all sandbox webhooks until it is.');
      return false;
    }
    if (!signatureHeader) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return signatureHeader === expected;
  }

  parseWebhookEvent(rawBody: string): ParsedWebhookEvent | null {
    try {
      const body = JSON.parse(rawBody);
      if (!body.externalEventId || !body.eventType || !body.providerPaymentId || !body.status) return null;
      return {
        externalEventId: String(body.externalEventId),
        eventType: String(body.eventType),
        providerPaymentId: String(body.providerPaymentId),
        status: body.status,
      };
    } catch {
      return null;
    }
  }

  /**
   * Dev/test-only helper, NOT part of the PaymentProvider interface — no real gateway involved
   * has anything like this. Without a signed provider contract yet, this is how the async
   * confirmation path (Payment PENDING → a webhook arrives → Order syncs) gets exercised for
   * real: it builds the exact rawBody + signature `POST /payments/webhooks/sandbox` expects, so
   * a test (or a manual curl during development) hits the real endpoint — signature
   * verification, WebhookEvent idempotency, and the Payment→Order sync all run for real, nothing
   * is bypassed. Requires PAYMENT_WEBHOOK_SECRET to be set (same as verifyWebhookSignature).
   */
  buildSimulatedWebhookRequest(
    providerPaymentId: string,
    status: ProviderStatusResult['status'],
    eventType = `payment.${status.toLowerCase()}`,
  ): SimulatedWebhookRequest {
    const secret = this.webhookSecret();
    if (!secret) {
      throw new Error('PAYMENT_WEBHOOK_SECRET must be set to build a simulated sandbox webhook.');
    }
    const rawBody = JSON.stringify({
      externalEventId: `sandbox_evt_${randomUUID()}`,
      eventType,
      providerPaymentId,
      status,
    });
    const signatureHeader = createHmac('sha256', secret).update(rawBody).digest('hex');
    return { rawBody, signatureHeader };
  }
}
