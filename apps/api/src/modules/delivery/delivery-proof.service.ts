import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryProofType, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const OTP_TTL_MINUTES = 45;
/** §31: rate limiting — a wrong guess is expected occasionally, unlimited guessing is not. */
const MAX_VERIFY_ATTEMPTS = 5;

/**
 * §30/31/69: MVP delivery-completion proof is OTP/customer-confirmation — PHOTO/SIGNATURE exist
 * on the enum for a later phase but aren't implemented here (§30: "no obligar fotografía si no
 * es necesaria").
 */
@Injectable()
export class DeliveryProofService {
  constructor(private readonly prisma: PrismaService) {}

  /** Called once, when the delivery is created — the code is valid for the whole delivery, not
   * regenerated per stage, so the customer can read the same code from Tracking throughout. */
  async generateOtp(tx: Prisma.TransactionClient, deliveryId: string): Promise<void> {
    const code = randomInt(100000, 1000000).toString();
    await tx.deliveryProof.create({
      data: {
        deliveryId,
        type: DeliveryProofType.OTP,
        code,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    });
  }

  /** §33: what the customer's tracking screen shows — ownership is checked by the caller. */
  async getCodeForCustomer(deliveryId: string): Promise<{ code: string | null; expiresAt: Date | null }> {
    const proof = await this.prisma.deliveryProof.findUnique({ where: { deliveryId } });
    if (!proof || proof.verifiedAt) return { code: null, expiresAt: null };
    return { code: proof.code, expiresAt: proof.expiresAt };
  }

  /** §31: rider-submitted code vs. the stored one. Throws DELIVERY_OTP_INVALID (wrong code, still
   * has attempts left), DELIVERY_OTP_EXPIRED, or DELIVERY_OTP_LOCKED (too many wrong attempts). */
  async verify(deliveryId: string, submittedCode: string): Promise<void> {
    const proof = await this.prisma.deliveryProof.findUnique({ where: { deliveryId } });
    if (!proof) throw new NotFoundException('No delivery proof found for this delivery');
    if (proof.verifiedAt) return; // idempotent — already confirmed, nothing to redo

    if (proof.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new ForbiddenException({
        error: { code: 'DELIVERY_OTP_LOCKED', message: 'Too many incorrect attempts — this code is locked.' },
      });
    }
    if (proof.expiresAt && proof.expiresAt < new Date()) {
      throw new BadRequestException({ error: { code: 'DELIVERY_OTP_EXPIRED', message: 'This code has expired.' } });
    }

    if (proof.code !== submittedCode) {
      await this.prisma.deliveryProof.update({
        where: { deliveryId },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({ error: { code: 'DELIVERY_OTP_INVALID', message: 'Incorrect code.' } });
    }

    await this.prisma.deliveryProof.update({ where: { deliveryId }, data: { verifiedAt: new Date() } });
  }
}
