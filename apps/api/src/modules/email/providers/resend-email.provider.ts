import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailProvider, SendEmailInput, SendEmailResult } from './email-provider.interface';

@Injectable()
export class ResendEmailProvider extends EmailProvider {
  readonly name = 'resend';
  private readonly logger = new Logger('ResendEmailProvider');
  private readonly client: Resend;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.client = new Resend(this.config.get<string>('RESEND_API_KEY'));
    // Resend's own sandbox sender — works with zero domain setup, exactly what "temporal" calls for.
    this.fromAddress = this.config.get<string>('EMAIL_FROM_ADDRESS') || 'onboarding@resend.dev';
    this.fromName = this.config.get<string>('EMAIL_FROM_NAME') || 'BINGO+';
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await this.client.emails.send({
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
