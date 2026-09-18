import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetDeliveryFareConfigDto } from './dto/set-delivery-fare-config.dto';

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
}
