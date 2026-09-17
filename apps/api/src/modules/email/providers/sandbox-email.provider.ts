import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider, SendEmailInput, SendEmailResult } from './email-provider.interface';

/**
 * Used whenever RESEND_API_KEY is unset — same "Sandbox when unconfigured" shape as
 * SandboxPaymentProvider/MockMapProvider elsewhere in this codebase. Nothing is actually
 * delivered; the full email (including the reset link / verification code) is logged instead, so
 * a developer without a real Resend key can still complete the forgot-password / verify-email
 * flow end to end by reading it off the server console.
 */
@Injectable()
export class SandboxEmailProvider extends EmailProvider {
  readonly name = 'sandbox';
  private readonly logger = new Logger('SandboxEmailProvider');

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const attachmentNote = input.attachments?.length
      ? ` | Attachments: ${input.attachments.map((a) => a.filename).join(', ')}`
      : '';
    this.logger.warn(
      `[SANDBOX EMAIL — not actually sent] To: ${input.to} | Subject: ${input.subject}${attachmentNote}\n${input.text}`,
    );
    return { success: true, providerMessageId: null };
  }
}
