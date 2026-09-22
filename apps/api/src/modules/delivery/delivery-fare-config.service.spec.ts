import { Prisma } from '@prisma/client';
import { DeliveryFareConfigService } from './delivery-fare-config.service';
import { PrismaService } from '../../prisma/prisma.service';

const CONFIG_ROW = {
  minFareDay: new Prisma.Decimal(1),
  minFareNight: new Prisma.Decimal(2),
  nightStartHour: 20,
  nightEndHour: 6,
  perKmRate: new Prisma.Decimal(0.5),
  perMinuteRate: new Prisma.Decimal(0.1),
  surgeThreshold: new Prisma.Decimal(2),
  surgeMultiplier: new Prisma.Decimal(1.5),
  bingoCommissionPercent: new Prisma.Decimal(0.2),
  riderTaxWithholdingPercent: new Prisma.Decimal(0.08),
};

describe('DeliveryFareConfigService', () => {
  let service: DeliveryFareConfigService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      deliveryFareConfig: { findFirst: jest.fn().mockResolvedValue(CONFIG_ROW) },
      riderCommissionOverride: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new DeliveryFareConfigService(prisma as unknown as PrismaService);
  });

  describe('splitRiderEarning', () => {
    // gross 1.45, commission 20% => commissionAmount 0.29, remainder 1.16, tax 8% of 1.16 =
    // 0.0928, netAmount = 1.16 - 0.0928 = 1.0672 — mirrors the Ganancias/RiderEarning formula
    // (DeliveryService.complete) exactly, since this is the same method it calls.
    it('splits the gross fare into commission, tax withholding, and the rider net amount', async () => {
      const result = await service.splitRiderEarning(1.45, 'rider-1');
      expect(Number(result.commissionAmount)).toBeCloseTo(0.29);
      expect(Number(result.taxWithheldAmount)).toBeCloseTo(0.0928);
      expect(Number(result.netAmount)).toBeCloseTo(1.0672);
    });

    it('never returns the net amount equal to the gross fare when commission/tax are configured', async () => {
      const result = await service.splitRiderEarning(1.45, 'rider-1');
      expect(Number(result.netAmount)).toBeLessThan(1.45);
    });

    it('accepts a Prisma.Decimal gross amount as well as a plain number', async () => {
      const fromNumber = await service.splitRiderEarning(1.45, 'rider-1');
      const fromDecimal = await service.splitRiderEarning(new Prisma.Decimal(1.45), 'rider-1');
      expect(Number(fromDecimal.netAmount)).toBeCloseTo(Number(fromNumber.netAmount));
    });

    it('prefers a live (non-expired) RiderCommissionOverride over the platform default commission percent', async () => {
      prisma.riderCommissionOverride.findFirst.mockResolvedValue({
        bingoCommissionPercent: new Prisma.Decimal(0.05),
      });
      const result = await service.splitRiderEarning(1.45, 'rider-1');
      // commission 5% => commissionAmount 0.0725, remainder 1.3775, tax 8% = 0.1102,
      // net = 1.3775 - 0.1102 = 1.2673 — a materially bigger net amount than the 20% default case.
      expect(Number(result.commissionAmount)).toBeCloseTo(0.0725);
      expect(Number(result.netAmount)).toBeCloseTo(1.2673);
    });

    it('falls back to the zero-config default (no commission/tax at all) when no DeliveryFareConfig row exists yet', async () => {
      prisma.deliveryFareConfig.findFirst.mockResolvedValue(null);
      const result = await service.splitRiderEarning(1.45, 'rider-1');
      expect(Number(result.commissionAmount)).toBe(0);
      expect(Number(result.taxWithheldAmount)).toBe(0);
      expect(Number(result.netAmount)).toBe(1.45);
    });
  });

  describe('getEffectiveCommissionPercent', () => {
    it('returns the platform default when the rider has no override', async () => {
      const percent = await service.getEffectiveCommissionPercent('rider-1');
      expect(percent).toBe(0.2);
    });

    it("returns the rider's live override percent when one exists", async () => {
      prisma.riderCommissionOverride.findFirst.mockResolvedValue({ bingoCommissionPercent: new Prisma.Decimal(0.1) });
      const percent = await service.getEffectiveCommissionPercent('rider-1');
      expect(percent).toBe(0.1);
    });
  });
});
