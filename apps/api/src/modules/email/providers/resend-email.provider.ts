import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailProvider, SendEmailInput, SendEmailResult } from './email-provider.interface';

@Injectable()
export class ResendEmailProvider extends EmailProvider {
  readonly name = 'resend';
  private readonly logger = new Logger('ResendEmailProvider');
  // Lazy on purpose — EmailModule always registers this class as a provider (so its factory can
  // choose between this and SandboxEmailProvider), which means Nest constructs it on every boot
  // regardless of which one the factory ends up using. Building the Resend client eagerly here
  // used to call `new Resend(undefined)` — which throws — on every environment that hasn't set
  // RESEND_API_KEY, crashing the whole app at startup instead of just falling back to sandbox.
  private client: Resend | null = null;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    super();
    // Resend's own sandbox sender — works with zero domain setup, exactly what "temporal" calls for.
    this.fromAddress = this.config.get<string>('EMAIL_FROM_ADDRESS') || 'onboarding@resend.dev';
    this.fromName = this.config.get<string>('EMAIL_FROM_NAME') || 'BINGO+';
  }

  private getClient(): Resend {
    if (!this.client) {
      const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY');
      this.client = new Resend(apiKey);
    }
    return this.client;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await this.getClient().emails.send({
      from: `${this.fromName} <${this.fromAddress}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    });
    if (result.error) {
      // Never marked as sent when it wasn't — the caller decides what "delivery failed" means
      // for its own flow (e.g. forgotPassword still no-ops on an unknown email either way, but a
      // genuine provider failure for a KNOWN email should be visible in logs, not swallowed silently).
      this.logger.error(`Resend send failed for ${input.to}: ${result.error.message}`);
      return { success: false, providerMessageId: null };
    }
    return { success: true, providerMessageId: result.data?.id ?? null };
  }
}
