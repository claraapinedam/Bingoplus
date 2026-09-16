import { Prisma } from '@prisma/client';

export interface CreatePaymentInput {
  /** Order id or Booking id — whichever this payment is for (FASE 9 §1). Purely an opaque
   * reference a real provider could attach as metadata; Sandbox ignores it entirely. */
  referenceId: string;
  amount: Prisma.Decimal;
  currency: string;
  idempotencyKey: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  /** Opaque, provider-specific — e.g. a Stripe clientSecret the frontend would use to collect card details. */
  clientSecret: string | null;
  status: 'PENDING' | 'REQUIRES_ACTION' | 'AUTHORIZED' | 'PAID' | 'FAILED';
}

export interface ProviderStatusResult {
  status: 'PENDING' | 'REQUIRES_ACTION' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
}

export interface RefundPaymentInput {
  providerPaymentId: string;
  amount: Prisma.Decimal;
}

export interface RefundPaymentResult {
  providerRefundId: string;
  status: 'COMPLETED' | 'FAILED';
}

export interface ParsedWebhookEvent {
  externalEventId: string;
  eventType: string;
  providerPaymentId: string;
  status: ProviderStatusResult['status'];
}

/**
 * The only surface OrdersService/PaymentService talk to (§16) — Order is never coupled directly
 * to Stripe/MercadoPago/etc. Swapping providers means implementing this interface, nothing else.
 */
export abstract class PaymentProvider {
  abstract readonly name: string;
  abstract createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** `simulate` is honored only by providers that support a test mode (e.g. Sandbox); a real provider ignores it. */
  abstract confirmPayment(
    providerPaymentId: string,
    simulate?: 'success' | 'failure',
  ): Promise<ProviderStatusResult>;
  abstract getPayment(providerPaymentId: string): Promise<ProviderStatusResult>;
  abstract refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  /** Raw body + header signature, never the parsed JSON — most real providers sign the exact bytes. */
  abstract verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean;
  abstract parseWebhookEvent(rawBody: string): ParsedWebhookEvent | null;
}

export const PAYMENT_PROVIDER_TOKEN = 'PAYMENT_PROVIDER_TOKEN';
