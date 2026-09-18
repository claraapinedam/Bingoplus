import { Injectable } from '@nestjs/common';
import { DeliveryStatus, RiderAvailabilityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MapService } from '../maps/map.service';
import { Coordinates } from '../maps/providers/map-provider.interface';
import { DeliveryFareConfigService, DeliveryFareConfigValues } from './delivery-fare-config.service';

export interface DeliveryFareResult {
  fee: number;
  distanceKm: number;
  durationMinutes: number;
  isNight: boolean;
  surgeApplied: boolean;
  surgeMultiplier: number;
}

/** A delivery still waiting on a rider — not yet RIDER_ASSIGNED or further along. */
const AWAITING_RIDER_STATUSES: DeliveryStatus[] = [DeliveryStatus.PENDING, DeliveryStatus.SEARCHING_RIDER];

/**
 * What the customer pays for delivery AND the base the rider's earnings are computed from — one
 * fare, quoted once at checkout and copied through to the Delivery record unchanged (Phase 4's
 * "never recomputes the order total" rule), never a business-set flat fee. See DeliveryFareConfig
 * for the formula this reads and RiderEarning for where the BINGO+ cut/tax withholding land.
 */
@Injectable()
export class DeliveryFareCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapService,
    private readonly fareConfig: DeliveryFareConfigService,
  ) {}

  async calculate(
    pickup: Coordinates | null,
    dropoff: Coordinates | null,
    timezone: string,
    now: Date = new Date(),
  ): Promise<DeliveryFareResult> {
    const config = await this.fareConfig.get();

    // §70-style degrade: unresolved coordinates or a failing map provider must never break
    // checkout — the quote just falls back to the flat minimum fare for the time of day.
    const route = pickup && dropoff ? await this.maps.calculateRouteSafe(pickup, dropoff) : null;
    const distanceKm = route?.distanceKm ?? 0;
    const durationMinutes = route?.durationMinutes ?? 0;

    const isNight = this.isNightHour(now, timezone, config.nightStartHour, config.nightEndHour);
    const minFare = isNight ? config.minFareNight : config.minFareDay;
    const distanceFare = config.perKmRate * distanceKm + config.perMinuteRate * durationMinutes;
    const baseFare = Math.max(minFare, distanceFare);

    const { surgeApplied } = await this.getSurgeState(config);
    const surgeMultiplier = surgeApplied ? config.surgeMultiplier : 1;
    const fee = Math.round(baseFare * surgeMultiplier * 100) / 100;

    return { fee, distanceKm, durationMinutes, isNight, surgeApplied, surgeMultiplier };
  }

  private isNightHour(now: Date, timezone: string, nightStartHour: number, nightEndHour: number): boolean {
    let hour = now.getHours();
    try {
      const formatted = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now);
      const parsed = Number(formatted);
      if (!Number.isNaN(parsed)) hour = parsed === 24 ? 0 : parsed;
    } catch {
      // Invalid/unknown IANA zone — fall back to server-local hour rather than throwing over a
      // rate-window nicety.
    }
    if (nightStartHour === nightEndHour) return false; // degenerate window configured = always day
    // The night window can wrap past midnight (e.g. 20 -> 6).
    return nightStartHour < nightEndHour
      ? hour >= nightStartHour && hour < nightEndHour
      : hour >= nightStartHour || hour < nightEndHour;
  }

  /** Live system-wide demand signal: deliveries still waiting on a rider vs. riders currently
   * AVAILABLE. No riders online at all counts as maxed-out demand whenever something is waiting —
   * never silently read as "no surge" just because the denominator is zero. */
  private async getSurgeState(config: DeliveryFareConfigValues): Promise<{ surgeApplied: boolean; ratio: number }> {
    const [awaitingCount, availableRiders] = await Promise.all([
      this.prisma.delivery.count({ where: { status: { in: AWAITING_RIDER_STATUSES } } }),
      this.prisma.rider.count({ where: { availabilityStatus: RiderAvailabilityStatus.AVAILABLE } }),
    ]);
    if (awaitingCount === 0) return { surgeApplied: false, ratio: 0 };
    const ratio = availableRiders === 0 ? Infinity : awaitingCount / availableRiders;
    return { surgeApplied: ratio >= config.surgeThreshold, ratio };
  }
}
