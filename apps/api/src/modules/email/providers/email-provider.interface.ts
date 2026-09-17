export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}

export interface SendEmailResult {
  success: boolean;
  providerMessageId: string | null;
}

/**
 * The only surface EmailService talks to — nothing else in this codebase should import a
 * provider directly, same shape as PaymentProvider (see payments/providers). Swapping Resend
 * for another transactional-email API means implementing this interface, nothing else.
 */
export abstract class EmailProvider {
  abstract readonly name: string;
  abstract send(input: SendEmailInput): Promise<SendEmailResult>;
}

export const EMAIL_PROVIDER_TOKEN = 'EMAIL_PROVIDER_TOKEN';
