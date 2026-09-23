import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SetPricingConfigDto } from './dto/set-pricing-config.dto';

export interface PricingConfigValues {
  serviceFeePercent: number;
  serviceFeeFixed: number;
  defaultTaxPercent: number;
}

/**
 * amount × serviceFeePercent + serviceFeeFixed — the one service-fee formula, reused wherever
 * BINGO+ charges a service fee on top of some due amount: PriceCalculationService.calculate's
 * `serviceFee` (Marketplace orders), MembershipsService.computeServiceFee (membership card
 * payments), and BookingsService.create (service bookings). Kept as a plain exported function
 * rather than a method so call sites that already have a live PricingConfigValues (e.g. inside a
 * loop, or alongside other config-derived numbers) don't need to re-fetch it — pass the config
 * you've already loaded via PricingConfigService.get().
 */
export function computeServiceFeeAmount(amount: Prisma.Decimal, config: PricingConfigValues): Prisma.Decimal {
  return amount.mul(config.serviceFeePercent).plus(config.serviceFeeFixed);
}

/** All fees start at 0 until Admin configures them — never a hardcoded default percentage. */
const ZERO_CONFIG: PricingConfigValues = {
  serviceFeePercent: 0,
  serviceFeeFixed: 0,
  defaultTaxPercent: 0,
};

/**
 * Customer-facing checkout fee configuration (§9/37) — append-only history like
 * MarketplaceRankingConfig: the latest row wins, so every fee change stays auditable. Never
 * hardcoded into PriceCalculationService itself. The business's own commission
 * (Commission.rate/BusinessContract) and delivery fare (DeliveryFareConfig) are deliberately
 * separate mechanisms, not part of this config.
 */
@Injectable()
export class PricingConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PricingConfigValues> {
    const config = await this.prisma.pricingConfiguration.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!config) return ZERO_CONFIG;
    return {
      serviceFeePercent: Number(config.serviceFeePercent),
      serviceFeeFixed: Number(config.serviceFeeFixed),
      defaultTaxPercent: Number(config.defaultTaxPercent),
    };
  }

  async set(dto: SetPricingConfigDto, updatedBy?: string): Promise<PricingConfigValues> {
    await this.prisma.pricingConfiguration.create({ data: { ...dto, updatedBy } });
    return dto;
  }
}
