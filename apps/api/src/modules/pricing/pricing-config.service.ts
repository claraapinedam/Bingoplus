import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetPricingConfigDto } from './dto/set-pricing-config.dto';

export interface PricingConfigValues {
  platformFeePercent: number;
  serviceFeePercent: number;
  serviceFeeFixed: number;
  defaultTaxPercent: number;
  defaultDeliveryFee: number;
}

/** All fees start at 0 until Admin configures them — never a hardcoded default percentage. */
const ZERO_CONFIG: PricingConfigValues = {
  platformFeePercent: 0,
  serviceFeePercent: 0,
  serviceFeeFixed: 0,
  defaultTaxPercent: 0,
  defaultDeliveryFee: 0,
};

/**
 * Platform/service/tax fee configuration (§9/37) — append-only history like
 * MarketplaceRankingConfig: the latest row wins, so every fee change stays auditable. Never
 * hardcoded into PriceCalculationService itself.
 */
@Injectable()
export class PricingConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PricingConfigValues> {
    const config = await this.prisma.pricingConfiguration.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!config) return ZERO_CONFIG;
    return {
      platformFeePercent: Number(config.platformFeePercent),
      serviceFeePercent: Number(config.serviceFeePercent),
      serviceFeeFixed: Number(config.serviceFeeFixed),
      defaultTaxPercent: Number(config.defaultTaxPercent),
      defaultDeliveryFee: Number(config.defaultDeliveryFee),
    };
  }

  async set(dto: SetPricingConfigDto, updatedBy?: string): Promise<PricingConfigValues> {
    await this.prisma.pricingConfiguration.create({ data: { ...dto, updatedBy } });
    return dto;
  }
}
