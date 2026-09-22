import { DeliveryStatus } from '@prisma/client';
import { DeliveryService } from './delivery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryFareConfigService } from './delivery-fare-config.service';

/**
 * §48 regression coverage: the Rider App must only ever be shown its own commission
 * (`riderNetAmount`), never Delivery.deliveryFee (the gross fare/tariff). This was the bug — the
 * Home screen's "Ganado hoy"/"Actividad reciente" and the accept-delivery screen were reading
 * `deliveryFee` straight off `GET /rider/deliveries` and `GET /rider/deliveries/:id`, while only
 * the Ganancias screen (`GET /rider/earnings`) computed the real net amount. Only listForRider /
 * getForRiderDetail (and the private withRiderNetAmount they share) are under test here — every
 * other DeliveryService dependency is stubbed out since these two methods never touch them.
 */
describe('DeliveryService riderNetAmount enrichment', () => {
  let service: DeliveryService;
  let prisma: any;
  let fareConfig: any;

  const unused = {} as any;

  beforeEach(() => {
    prisma = {
      delivery: { findMany: jest.fn(), findUnique: jest.fn() },
      riderEarning: { findMany: jest.fn().mockResolvedValue([]) },
    };
    fareConfig = { splitRiderEarning: jest.fn() };
    service = new DeliveryService(
      prisma as unknown as PrismaService,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      fareConfig as unknown as DeliveryFareConfigService,
    );
  });

  describe('listForRider', () => {
    it('uses the stored RiderEarning.netAmount for a DELIVERED delivery instead of recomputing it', async () => {
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'd1', riderId: 'rider-1', deliveryFee: 1.45, status: DeliveryStatus.DELIVERED },
      ]);
      prisma.riderEarning.findMany.mockResolvedValue([{ deliveryId: 'd1', netAmount: 0.99 }]);

      const result = await service.listForRider('rider-1');

      expect(result[0].riderNetAmount).toBe(0.99);
      expect(fareConfig.splitRiderEarning).not.toHaveBeenCalled();
    });

    it('estimates riderNetAmount from the fare config for a not-yet-completed delivery (e.g. a pending offer)', async () => {
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'd2', riderId: 'rider-1', deliveryFee: 1.45, status: DeliveryStatus.RIDER_ASSIGNED },
      ]);
      fareConfig.splitRiderEarning.mockResolvedValue({ netAmount: 1.0672 });

      const result = await service.listForRider('rider-1');

      expect(fareConfig.splitRiderEarning).toHaveBeenCalledWith(1.45, 'rider-1');
      expect(result[0].riderNetAmount).toBeCloseTo(1.0672);
    });

    it('never falls back to the gross deliveryFee as the riderNetAmount', async () => {
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'd3', riderId: 'rider-1', deliveryFee: 1.45, status: DeliveryStatus.IN_TRANSIT },
      ]);
      fareConfig.splitRiderEarning.mockResolvedValue({ netAmount: 0.99 });

      const result = await service.listForRider('rider-1');

      expect(result[0].riderNetAmount).not.toBe(1.45);
      expect(result[0].riderNetAmount).toBe(0.99);
    });
  });

  describe('getForRiderDetail', () => {
    it('enriches a single delivery lookup the same way as the list', async () => {
      prisma.delivery.findUnique.mockResolvedValue({ id: 'd4', riderId: 'rider-1', deliveryFee: 1.45, status: DeliveryStatus.RIDER_ASSIGNED });
      fareConfig.splitRiderEarning.mockResolvedValue({ netAmount: 1.0672 });

      const result = await service.getForRiderDetail('rider-1', 'd4');

      expect(result.riderNetAmount).toBeCloseTo(1.0672);
    });

    it('still enforces ownership (a delivery not assigned to this rider is rejected) before enrichment runs', async () => {
      prisma.delivery.findUnique.mockResolvedValue({ id: 'd5', riderId: 'someone-else', deliveryFee: 1.45, status: DeliveryStatus.RIDER_ASSIGNED });

      await expect(service.getForRiderDetail('rider-1', 'd5')).rejects.toThrow('This delivery is not assigned to you');
      expect(fareConfig.splitRiderEarning).not.toHaveBeenCalled();
    });
  });
});
