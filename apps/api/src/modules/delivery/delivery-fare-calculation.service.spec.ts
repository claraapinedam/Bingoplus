import { DeliveryFareCalculationService } from './delivery-fare-calculation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MapService } from '../maps/map.service';
import { DeliveryFareConfigService } from './delivery-fare-config.service';

const BASE_CONFIG = {
  minFareDay: 1,
  minFareNight: 2,
  nightStartHour: 20,
  nightEndHour: 6,
  perKmRate: 0.5,
  perMinuteRate: 0.1,
  surgeThreshold: 2,
  surgeMultiplier: 1.5,
  bingoCommissionPercent: 0.2,
  riderTaxWithholdingPercent: 0.08,
};

describe('DeliveryFareCalculationService', () => {
  let service: DeliveryFareCalculationService;
  let prisma: any;
  let maps: any;
  let fareConfig: any;

  const pickup = { latitude: -0.18, longitude: -78.47 };
  const dropoff = { latitude: -0.19, longitude: -78.48 };

  beforeEach(() => {
    prisma = {
      delivery: { count: jest.fn().mockResolvedValue(0) },
      rider: { count: jest.fn().mockResolvedValue(5) },
    };
    maps = { calculateRouteSafe: jest.fn().mockResolvedValue({ distanceKm: 4, durationMinutes: 12 }) };
    fareConfig = { get: jest.fn().mockResolvedValue(BASE_CONFIG) };
    service = new DeliveryFareCalculationService(
      prisma as unknown as PrismaService,
      maps as unknown as MapService,
      fareConfig as unknown as DeliveryFareConfigService,
    );
  });

  it('charges the distance/time fare when it exceeds the minimum (daytime)', async () => {
    // distanceFare = 0.5*4 + 0.1*12 = 3.2, above minFareDay (1)
    const result = await service.calculate(pickup, dropoff, 'America/Guayaquil', new Date('2026-01-01T15:00:00Z'));
    expect(result.fee).toBeCloseTo(3.2);
    expect(result.isNight).toBe(false);
  });

  it('floors at the minimum fare when the distance/time fare would be lower', async () => {
    maps.calculateRouteSafe.mockResolvedValue({ distanceKm: 0.2, durationMinutes: 1 });
    // distanceFare = 0.5*0.2 + 0.1*1 = 0.2, below minFareDay (1) -> floors at 1
    const result = await service.calculate(pickup, dropoff, 'America/Guayaquil', new Date('2026-01-01T15:00:00Z'));
    expect(result.fee).toBe(1);
  });

  it('uses the night minimum during the configured night window', async () => {
    maps.calculateRouteSafe.mockResolvedValue({ distanceKm: 0.1, durationMinutes: 1 });
    // 22:00 local in America/Guayaquil (UTC-5) = 03:00Z next day, inside the 20-6 night window
    const result = await service.calculate(pickup, dropoff, 'America/Guayaquil', new Date('2026-01-02T03:00:00Z'));
    expect(result.isNight).toBe(true);
    expect(result.fee).toBe(2); // floors at minFareNight
  });

  it('applies the surge multiplier once the awaiting/available ratio meets the threshold', async () => {
    prisma.delivery.count.mockResolvedValue(10); // awaiting a rider
    prisma.rider.count.mockResolvedValue(4); // available — ratio 2.5 >= threshold 2
    const result = await service.calculate(pickup, dropoff, 'America/Guayaquil', new Date('2026-01-01T15:00:00Z'));
    expect(result.surgeApplied).toBe(true);
    expect(result.fee).toBeCloseTo(3.2 * 1.5);
  });

  it('treats zero available riders as maxed-out demand whenever something is awaiting one', async () => {
    prisma.delivery.count.mockResolvedValue(3);
    prisma.rider.count.mockResolvedValue(0);
    const result = await service.calculate(pickup, dropoff, 'America/Guayaquil', new Date('2026-01-01T15:00:00Z'));
    expect(result.surgeApplied).toBe(true);
  });

  it('never surges when nothing is currently awaiting a rider', async () => {
    prisma.delivery.count.mockResolvedValue(0);
    prisma.rider.count.mockResolvedValue(0);
    const result = await service.calculate(pickup, dropoff, 'America/Guayaquil', new Date('2026-01-01T15:00:00Z'));
    expect(result.surgeApplied).toBe(false);
  });

  it('degrades to the flat minimum fare when coordinates are missing, without calling Maps', async () => {
    const result = await service.calculate(null, dropoff, 'America/Guayaquil', new Date('2026-01-01T15:00:00Z'));
    expect(maps.calculateRouteSafe).not.toHaveBeenCalled();
    expect(result.fee).toBe(1);
    expect(result.distanceKm).toBe(0);
  });

  it('degrades to the flat minimum fare when the map provider fails', async () => {
    maps.calculateRouteSafe.mockResolvedValue(null);
    const result = await service.calculate(pickup, dropoff, 'America/Guayaquil', new Date('2026-01-01T15:00:00Z'));
    expect(result.fee).toBe(1);
  });
});
