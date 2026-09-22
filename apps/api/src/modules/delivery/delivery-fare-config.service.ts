import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SetDeliveryFareConfigDto } from './dto/set-delivery-fare-config.dto';

/** The three-way split of a delivery's gross fare between what BINGO+ keeps (commission), what's
 * withheld for the rider's tax, and what actually lands in the rider's pocket. See
 * DeliveryFareConfigService.splitRiderEarning — the one place this math happens, so a rider-facing
 * screen never shows the gross fare it was computed from (§48 — riders only ever see their own
 * earning, never the tariff/fare a customer or business paid). */
export interface RiderEarningSplit {
  commissionAmount: Prisma.Decimal;
  taxWithheldAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
}

export interface DeliveryFareConfigValues {
  minFareDay: number;
  minFareNight: number;
  nightStartHour: number;
  nightEndHour: number;
  perKmRate: number;
  perMinuteRate: number;
  surgeThreshold: number;
  surgeMultiplier: number;
  bingoCommissionPercent: number;
  riderTaxWithholdingPercent: number;
}

/** Everything starts at 0 (surgeMultiplier at 1 = no-op) until Admin configures it — never a
 * hardcoded default, same rule as PricingConfigService. */
const ZERO_CONFIG: DeliveryFareConfigValues = {
  minFareDay: 0,
  minFareNight: 0,
  nightStartHour: 20,
  nightEndHour: 6,
  perKmRate: 0,
  perMinuteRate: 0,
  surgeThreshold: 2,
  surgeMultiplier: 1,
  bingoCommissionPercent: 0,
  riderTaxWithholdingPercent: 0,
};

/**
 * Delivery is an agreement BINGO+ makes with the Rider, never something a business sets (see
 * Business, which has no delivery-fee field) — this is the single source of truth for that
 * formula. Append-only history like PricingConfigService/RiderDispatchConfig: the latest row wins.
 */
@Injectable()
export class DeliveryFareConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<DeliveryFareConfigValues> {
    const config = await this.prisma.deliveryFareConfig.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!config) return ZERO_CONFIG;
    return {
      minFareDay: Number(config.minFareDay),
      minFareNight: Number(config.minFareNight),
      nightStartHour: config.nightStartHour,
      nightEndHour: config.nightEndHour,
      perKmRate: Number(config.perKmRate),
      perMinuteRate: Number(config.perMinuteRate),
      surgeThreshold: Number(config.surgeThreshold),
      surgeMultiplier: Number(config.surgeMultiplier),
      bingoCommissionPercent: Number(config.bingoCommissionPercent),
      riderTaxWithholdingPercent: Number(config.riderTaxWithholdingPercent),
    };
  }

  async set(dto: SetDeliveryFareConfigDto, updatedBy?: string): Promise<DeliveryFareConfigValues> {
    await this.prisma.deliveryFareConfig.create({ data: { ...dto, updatedBy } });
    return dto;
  }

  /** The commission percent DeliveryService.complete() should actually use for this rider right
   * now — a live (non-expired) RiderCommissionOverride from a redeemed CommissionCoupon takes
   * priority over the platform-wide default; once it expires this naturally falls back to
   * `get().bingoCommissionPercent` with no scheduled job needed to revert it. */
  async getEffectiveCommissionPercent(riderId: string): Promise<number> {
    const override = await this.prisma.riderCommissionOverride.findFirst({
      where: { riderId, expiresAt: { gt: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (override) return Number(override.bingoCommissionPercent);
    return (await this.get()).bingoCommissionPercent;
  }

  /** The single source of truth for turning a delivery's gross fare into what a specific rider
   * actually earns from it — DeliveryService.complete() uses this to write the authoritative
   * RiderEarning row, and rider-facing delivery responses (list/detail, and the accept-delivery
   * screen before a RiderEarning even exists) use it to show a live estimate of the same number,
   * so the commission math never has to be duplicated or drift between the two. */
  async splitRiderEarning(grossAmount: Prisma.Decimal | number, riderId: string): Promise<RiderEarningSplit> {
    const config = await this.get();
    const bingoCommissionPercent = await this.getEffectiveCommissionPercent(riderId);
    const gross = grossAmount instanceof Prisma.Decimal ? grossAmount : new Prisma.Decimal(grossAmount);
    const commissionAmount = gross.mul(bingoCommissionPercent);
    const taxWithheldAmount = gross.minus(commissionAmount).mul(config.riderTaxWithholdingPercent);
    const netAmount = gross.minus(commissionAmount).minus(taxWithheldAmount);
    return { commissionAmount, taxWithheldAmount, netAmount };
  }
}
