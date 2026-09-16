import { BusinessCapabilityType } from '@prisma/client';
import { BusinessCapabilitiesService } from './business-capabilities.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BusinessCapabilitiesService', () => {
  let service: BusinessCapabilitiesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      businessCapability: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        createMany: jest.fn(),
      },
    };
    service = new BusinessCapabilitiesService(prisma as unknown as PrismaService);
  });

  describe('getMap', () => {
    it('defaults every capability to false and only flips the ones actually stored', async () => {
      prisma.businessCapability.findMany.mockResolvedValue([
        { capability: BusinessCapabilityType.SELLS_PRODUCTS, enabled: true },
      ]);

      const map = await service.getMap('b1');

      expect(map.SELLS_PRODUCTS).toBe(true);
      expect(map.DIRECTORY_LISTING).toBe(false);
      expect(map.SERVICES).toBe(false);
    });
  });

  describe('RULE 4 — Marketplace eligibility', () => {
    it('is eligible once SELLS_PRODUCTS is enabled', async () => {
      prisma.businessCapability.findUnique.mockResolvedValue({ enabled: true });
      expect(await service.has('b1', BusinessCapabilityType.SELLS_PRODUCTS)).toBe(true);
    });

    it('is not eligible when SELLS_PRODUCTS was never granted', async () => {
      prisma.businessCapability.findUnique.mockResolvedValue(null);
      expect(await service.has('b1', BusinessCapabilityType.SELLS_PRODUCTS)).toBe(false);
    });

    it('is not eligible when SELLS_PRODUCTS exists but was disabled', async () => {
      prisma.businessCapability.findUnique.mockResolvedValue({ enabled: false });
      expect(await service.has('b1', BusinessCapabilityType.SELLS_PRODUCTS)).toBe(false);
    });
  });

  describe('RULE 5 — Directory eligibility', () => {
    it('is eligible once DIRECTORY_LISTING is enabled, independent of SELLS_PRODUCTS', async () => {
      prisma.businessCapability.findUnique.mockResolvedValue({ enabled: true });
      expect(await service.has('b1', BusinessCapabilityType.DIRECTORY_LISTING)).toBe(true);
    });
  });

  describe('Hybrid business support', () => {
    it('the same business can be Marketplace- and Directory-eligible at once', async () => {
      prisma.businessCapability.findMany.mockResolvedValue([
        { capability: BusinessCapabilityType.SELLS_PRODUCTS, enabled: true },
        { capability: BusinessCapabilityType.DIRECTORY_LISTING, enabled: true },
      ]);
      const map = await service.getMap('hybrid-1');
      expect(map.SELLS_PRODUCTS).toBe(true);
      expect(map.DIRECTORY_LISTING).toBe(true);
    });
  });

  describe('grantOnboardingDefaults', () => {
    it('grants DIRECTORY_LISTING and SELLS_PRODUCTS from the caller-decided onboarding answers', async () => {
      await service.grantOnboardingDefaults('b1', { sellsProducts: false, directoryListing: true });

      const rows = prisma.businessCapability.createMany.mock.calls[0][0].data;
      expect(rows).toEqual(
        expect.arrayContaining([
          { businessId: 'b1', capability: BusinessCapabilityType.DIRECTORY_LISTING, enabled: true },
          { businessId: 'b1', capability: BusinessCapabilityType.SELLS_PRODUCTS, enabled: false },
        ]),
      );
      // A business that answered "no" to selling products gets no PICKUP/DELIVERY rows at all.
      expect(rows.some((r: any) => r.capability === BusinessCapabilityType.PICKUP)).toBe(false);
    });

    it('does not grant DIRECTORY_LISTING when the applicant declined it', async () => {
      await service.grantOnboardingDefaults('b1', { sellsProducts: false, directoryListing: false });

      const rows = prisma.businessCapability.createMany.mock.calls[0][0].data;
      expect(rows).toEqual(
        expect.arrayContaining([{ businessId: 'b1', capability: BusinessCapabilityType.DIRECTORY_LISTING, enabled: false }]),
      );
    });

    it('only grants PICKUP/DELIVERY when sellsProducts is true', async () => {
      await service.grantOnboardingDefaults('b1', {
        sellsProducts: true,
        directoryListing: true,
        pickupEnabled: true,
        deliveryEnabled: false,
      });

      const rows = prisma.businessCapability.createMany.mock.calls[0][0].data;
      expect(rows).toEqual(
        expect.arrayContaining([
          { businessId: 'b1', capability: BusinessCapabilityType.PICKUP, enabled: true },
          { businessId: 'b1', capability: BusinessCapabilityType.DELIVERY, enabled: false },
        ]),
      );
    });
  });
});
