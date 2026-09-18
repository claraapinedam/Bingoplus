import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetPricingConfigDto } from './dto/set-pricing-config.dto';

export interface PricingConfigValues {
  serviceFeePercent: number;
  serviceFeeFixed: number;
  defaultTaxPercent: number;
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
