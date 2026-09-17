import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_PROVIDER_TOKEN, EmailProvider } from './providers/email-provider.interface';

/**
 * The only place AuthService talks to for actually delivering an email — owns the two templates
 * this phase needs (password reset link, email-verification code). Deliberately separate from
 * NotificationService (apps/modules/notifications): that one is for the in-app Notification
 * Center on an authenticated User; these two emails happen to unauthenticated or not-yet-verified
 * people, so they were never a fit for that system.
 */
@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider) {}

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    return this.provider.send({
      to,
      subject: 'Recupera tu contraseña de BINGO+',
      html: `
        <p>Recibimos una solicitud para restablecer tu contraseña de BINGO+.</p>
        <p><a href="${resetUrl}">Haz clic aquí para elegir una nueva contraseña</a></p>
        <p>Este enlace vence en 1 hora. Si tú no solicitaste esto, puedes ignorar este correo.</p>
      `,
      text: `Recibimos una solicitud para restablecer tu contraseña de BINGO+.\n\nAbre este enlace para elegir una nueva contraseña:\n${resetUrl}\n\nEste enlace vence en 1 hora. Si tú no solicitaste esto, puedes ignorar este correo.`,
    });
  }

  async sendVerificationEmail(to: string, code: string) {
    return this.provider.send({
      to,
      subject: 'Verifica tu correo — BINGO+',
      html: `
        <p>¡Gracias por registrarte en BINGO+!</p>
        <p>Tu código de verificación es:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
        <p>Este código vence en 15 minutos.</p>
      `,
      text: `¡Gracias por registrarte en BINGO+!\n\nTu código de verificación es: ${code}\n\nEste código vence en 15 minutos.`,
    });
  }
}
