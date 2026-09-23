import { BadRequestException } from '@nestjs/common';
import { BusinessMembershipStatus, BusinessStatus, MembershipPlanStatus } from '@prisma/client';
import { BusinessesService } from './businesses.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BusinessesService', () => {
  let service: BusinessesService;
  let prisma: any;
  let capabilities: any;
  let memberships: any;
  let contracts: any;

  const baseApplyDto = {
    tradeName: 'T', idType: 'RUC', legalName: 'T SA', representativeName: 'Rep Name', taxId: '1',
    email: 'e@e.com', phone: '099', categorySlugs: ['tiendas'], addressLine: 'Av 1', city: 'Quito',
    speciesSlugs: ['perro'],
  };
  // Directory-only tests override sellsProducts to false but inherit categorySlugs from above —
  // "tiendas" is only valid when sellsProducts is true (see resolveCategoryIds), so those need a
  // real Directory-type category instead.
  const directoryCategory = { categorySlugs: ['veterinarios'] };

  beforeEach(() => {
    prisma = {
      business: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      // Static, not filtered by the `where` argument (same convention as petSpecies.findMany below) —
      // matches baseApplyDto's default categorySlugs; directory-only tests override it to return
      // 'veterinarios' instead right before calling apply.
      businessCategory: { findMany: jest.fn().mockResolvedValue([{ id: 'cat1', slug: 'tiendas' }]) },
      petSpecies: { findMany: jest.fn().mockResolvedValue([{ id: 's1', slug: 'perro' }]) },
      membershipPlan: { findUnique: jest.fn() },
      businessMembership: { create: jest.fn() },
      role: { findUnique: jest.fn().mockResolvedValue(null) },
      userRole: { upsert: jest.fn() },
      commission: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      order: { groupBy: jest.fn().mockResolvedValue([]) },
      platformSetting: { findUnique: jest.fn(), upsert: jest.fn() },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    capabilities = {
      getMap: jest.fn().mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: false }),
      grantOnboardingDefaults: jest.fn(),
      set: jest.fn().mockResolvedValue({ id: 'cap1' }),
      setManyDisabled: jest.fn().mockResolvedValue(undefined),
    };
    memberships = { startTrialIfMissing: jest.fn(), redeemAdminCoupon: jest.fn() };
    contracts = {
      createForApprovedBusiness: jest.fn().mockResolvedValue({ id: 'contract1' }),
      requestCapabilityChange: jest.fn().mockResolvedValue({ requiresSignature: false }),
    };
    service = new BusinessesService(
      prisma as unknown as PrismaService,
      {} as any,
      capabilities,
      memberships,
      { getCouponSummary: jest.fn().mockResolvedValue({ hasActiveCoupons: false, count: 0 }) } as any,
      contracts,
    );
  });

  describe('apply — directory-listing membership rule', () => {
    it('a pure product-seller (no Directory) gets no membership — visible only in Tiendas', async () => {
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      await service.apply('u1', { ...baseApplyDto, sellsProducts: true, directoryListing: false } as any);

      expect(capabilities.grantOnboardingDefaults).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ sellsProducts: true, directoryListing: false }),
      );
      expect(prisma.businessMembership.create).not.toHaveBeenCalled();
    });

    it('a business that declines the directory gets no membership either', async () => {
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      prisma.businessCategory.findMany.mockResolvedValue([{ id: 'cat2', slug: 'veterinarios' }]);
      await service.apply('u1', { ...baseApplyDto, ...directoryCategory, sellsProducts: false, directoryListing: false } as any);

      expect(capabilities.grantOnboardingDefaults).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ sellsProducts: false, directoryListing: false }),
      );
      expect(prisma.businessMembership.create).not.toHaveBeenCalled();
    });

    it('rejects a directory-only business that wants to be listed but picked no plan', async () => {
      await expect(
        service.apply('u1', { ...baseApplyDto, sellsProducts: false, directoryListing: true } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it('a business that sells products AND wants the Directory still needs a plan ("Ambos")', async () => {
      await expect(
        service.apply('u1', { ...baseApplyDto, sellsProducts: true, directoryListing: true } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it('"Ambos" with a valid plan creates both SELLS_PRODUCTS and a membership', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.ACTIVE, trialDays: 14 });
      prisma.business.create.mockResolvedValue({ id: 'b1' });

      await service.apply('u1', {
        ...baseApplyDto,
        sellsProducts: true,
        directoryListing: true,
        membershipPlanId: 'p1',
      } as any);

      expect(capabilities.grantOnboardingDefaults).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ sellsProducts: true, directoryListing: true }),
      );
      expect(prisma.businessMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ businessId: 'b1', planId: 'p1' }) }),
      );
    });

    it('rejects an unknown or inactive membership plan before creating anything', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.INACTIVE, trialDays: 14 });
      await expect(
        service.apply('u1', { ...baseApplyDto, sellsProducts: false, directoryListing: true, membershipPlanId: 'p1' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it('creates a TRIAL membership on the chosen plan for a directory-only business', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.ACTIVE, trialDays: 14 });
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      prisma.businessCategory.findMany.mockResolvedValue([{ id: 'cat2', slug: 'veterinarios' }]);

      await service.apply('u1', { ...baseApplyDto, ...directoryCategory, sellsProducts: false, directoryListing: true, membershipPlanId: 'p1' } as any);

      expect(prisma.businessMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ businessId: 'b1', planId: 'p1', status: BusinessMembershipStatus.TRIAL }) }),
      );
      expect(memberships.redeemAdminCoupon).not.toHaveBeenCalled();
    });

    it('an invalid coupon code does not fail the whole application — it comes back as couponError', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.ACTIVE, trialDays: 14 });
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      memberships.redeemAdminCoupon.mockRejectedValue(new BadRequestException('This coupon is not active'));
      prisma.businessCategory.findMany.mockResolvedValue([{ id: 'cat2', slug: 'veterinarios' }]);

      const result = await service.apply('u1', {
        ...baseApplyDto,
        ...directoryCategory,
        sellsProducts: false,
        directoryListing: true,
        membershipPlanId: 'p1',
        couponCode: 'BADCODE',
      } as any);

      expect(result.couponError).toBe('This coupon is not active');
      expect(result.id).toBe('b1');
    });

    it('applies a valid coupon with no error surfaced', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.ACTIVE, trialDays: 14 });
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      memberships.redeemAdminCoupon.mockResolvedValue({ id: 'redemption1' });
      prisma.businessCategory.findMany.mockResolvedValue([{ id: 'cat2', slug: 'veterinarios' }]);

      const result = await service.apply('u1', {
        ...baseApplyDto,
        ...directoryCategory,
        sellsProducts: false,
        directoryListing: true,
        membershipPlanId: 'p1',
        couponCode: 'GOOD10',
      } as any);

      expect(memberships.redeemAdminCoupon).toHaveBeenCalledWith('b1', 'GOOD10');
      expect(result.couponError).toBeUndefined();
    });
  });

  describe('apply — species', () => {
    it('rejects an unknown pet species slug before creating anything', async () => {
      prisma.petSpecies.findMany.mockResolvedValue([]);

      await expect(
        service.apply('u1', { ...baseApplyDto, sellsProducts: true, directoryListing: false, speciesSlugs: ['dinosaurio'] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it('creates the business with its resolved BusinessSpecies rows', async () => {
      prisma.petSpecies.findMany.mockResolvedValue([{ id: 's1', slug: 'perro' }, { id: 's2', slug: 'gato' }]);
      prisma.business.create.mockResolvedValue({ id: 'b1' });

      await service.apply('u1', {
        ...baseApplyDto,
        sellsProducts: true,
        directoryListing: false,
        speciesSlugs: ['perro', 'gato'],
      } as any);

      expect(prisma.business.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            species: { create: [{ speciesId: 's1' }, { speciesId: 's2' }] },
          }),
        }),
      );
    });
  });

  describe('apply — RUC vs CEDULA', () => {
    it('rejects RUC without a representativeName', async () => {
      await expect(
        service.apply('u1', {
          ...baseApplyDto,
          idType: 'RUC',
          representativeName: '   ',
          sellsProducts: true,
          directoryListing: false,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it('persists representativeName for RUC', async () => {
      prisma.business.create.mockResolvedValue({ id: 'b1' });

      await service.apply('u1', {
        ...baseApplyDto,
        idType: 'RUC',
        representativeName: 'Ana Pérez',
        sellsProducts: true,
        directoryListing: false,
      } as any);

      expect(prisma.business.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idType: 'RUC', representativeName: 'Ana Pérez' }) }),
      );
    });

    it('never persists a representativeName for CEDULA, even if one was sent', async () => {
      prisma.business.create.mockResolvedValue({ id: 'b1' });

      await service.apply('u1', {
        ...baseApplyDto,
        idType: 'CEDULA',
        representativeName: 'Should be ignored',
        sellsProducts: true,
        directoryListing: false,
      } as any);

      expect(prisma.business.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idType: 'CEDULA', representativeName: null }) }),
      );
    });
  });

  it('refuses to approve a business that is already ACTIVE', async () => {
    prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.ACTIVE });

    await expect(service.approve('b1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies the default commission rate when none is provided', async () => {
    prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.PENDING });
    prisma.platformSetting.findUnique.mockResolvedValue({ value: 0.2 });
    prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.APPROVED });

    await service.approve('b1', 'admin-1');

    expect(prisma.commission.create).toHaveBeenCalledWith({
      data: { businessId: 'b1', rate: 0.2, createdBy: 'admin-1' },
    });
  });

  it('generates a pending-signature contract as part of approving a business', async () => {
    prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.PENDING });
    prisma.platformSetting.findUnique.mockResolvedValue({ value: 0.2 });
    prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.APPROVED });

    await service.approve('b1', 'admin-1');

    expect(contracts.createForApprovedBusiness).toHaveBeenCalledWith('b1');
  });

  it('a business only becomes sellable once activated, never on approve alone', async () => {
    prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.ACTIVE });
    const result = await service.activate('b1');
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: BusinessStatus.ACTIVE },
    });
    expect(result.status).toBe(BusinessStatus.ACTIVE);
  });

  describe('setCapabilityAsAdmin — capability changes with real payment terms need a new signature', () => {
    it('applies immediately when turning a capability off', async () => {
      const result = await service.setCapabilityAsAdmin('b1', 'SELLS_PRODUCTS' as any, false);

      expect(contracts.requestCapabilityChange).not.toHaveBeenCalled();
      expect(capabilities.set).toHaveBeenCalledWith('b1', 'SELLS_PRODUCTS', false);
      expect(result).toEqual({ requiresSignature: false, capability: { id: 'cap1' } });
    });

    it('applies immediately for a non-monetized capability like SERVICES', async () => {
      await service.setCapabilityAsAdmin('b1', 'SERVICES' as any, true);

      expect(contracts.requestCapabilityChange).not.toHaveBeenCalled();
      expect(capabilities.set).toHaveBeenCalledWith('b1', 'SERVICES', true);
    });

    it('cascades SERVICES/BOOKINGS/COUPONS/HOME_SERVICE off when DIRECTORY_LISTING is turned off', async () => {
      await service.setCapabilityAsAdmin('b1', 'DIRECTORY_LISTING' as any, false);

      expect(capabilities.setManyDisabled).toHaveBeenCalledWith('b1', ['SERVICES', 'BOOKINGS', 'COUPONS', 'HOME_SERVICE']);
    });

    it('cascades PICKUP/DELIVERY off when SELLS_PRODUCTS is turned off', async () => {
      await service.setCapabilityAsAdmin('b1', 'SELLS_PRODUCTS' as any, false);

      expect(capabilities.setManyDisabled).toHaveBeenCalledWith('b1', ['PICKUP', 'DELIVERY']);
    });

    it('does not cascade anything when turning an unrelated capability off', async () => {
      await service.setCapabilityAsAdmin('b1', 'COUPONS' as any, false);

      expect(capabilities.setManyDisabled).not.toHaveBeenCalled();
    });

    it('applies immediately when the governing contract already covers the addition', async () => {
      contracts.requestCapabilityChange.mockResolvedValue({ requiresSignature: false });

      const result = await service.setCapabilityAsAdmin('b1', 'SELLS_PRODUCTS' as any, true);

      expect(contracts.requestCapabilityChange).toHaveBeenCalledWith('b1', true, false);
      expect(capabilities.set).toHaveBeenCalledWith('b1', 'SELLS_PRODUCTS', true);
      expect(result.requiresSignature).toBe(false);
    });

    it('withholds the toggle and returns the pending contract when a new signature is required', async () => {
      contracts.requestCapabilityChange.mockResolvedValue({ requiresSignature: true, contract: { id: 'contract2' } });

      const result = await service.setCapabilityAsAdmin('b1', 'DIRECTORY_LISTING' as any, true);

      expect(memberships.startTrialIfMissing).toHaveBeenCalledWith('b1');
      expect(capabilities.set).not.toHaveBeenCalled();
      expect(result).toEqual({ requiresSignature: true, pendingContractId: 'contract2' });
    });
  });

  describe('setOperationalCapability — owner self-service, gated by dependency capabilities', () => {
    it('rejects turning on BOOKINGS while DIRECTORY_LISTING is off', async () => {
      capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: false });

      await expect(service.setOperationalCapability('b1', 'BOOKINGS' as any, true)).rejects.toBeInstanceOf(BadRequestException);
      expect(capabilities.set).not.toHaveBeenCalled();
    });

    it('rejects HOME_SERVICE outright — it is admin/derived-only, never owner-settable directly', async () => {
      await expect(service.setOperationalCapability('b1', 'HOME_SERVICE' as any, true)).rejects.toBeInstanceOf(BadRequestException);
      expect(capabilities.getMap).not.toHaveBeenCalled();
    });

    it('allows turning on BOOKINGS once DIRECTORY_LISTING is on', async () => {
      capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: true });

      await service.setOperationalCapability('b1', 'BOOKINGS' as any, true);

      expect(capabilities.set).toHaveBeenCalledWith('b1', 'BOOKINGS', true);
    });

    it('rejects turning on DELIVERY while SELLS_PRODUCTS is off', async () => {
      capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: true });

      await expect(service.setOperationalCapability('b1', 'DELIVERY' as any, true)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never gates turning a capability off', async () => {
      capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: false });

      await service.setOperationalCapability('b1', 'BOOKINGS' as any, false);

      expect(capabilities.set).toHaveBeenCalledWith('b1', 'BOOKINGS', false);
    });

    it('still rejects SELLS_PRODUCTS/DIRECTORY_LISTING themselves — admin-only', async () => {
      await expect(service.setOperationalCapability('b1', 'DIRECTORY_LISTING' as any, true)).rejects.toBeInstanceOf(BadRequestException);
      expect(capabilities.getMap).not.toHaveBeenCalled();
    });
  });

  describe('approve — membership only for Directory-listed businesses', () => {
    it('does not start a membership when the business never opted into the Directory', async () => {
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.PENDING });
      capabilities.getMap.mockResolvedValue({ DIRECTORY_LISTING: false, SELLS_PRODUCTS: true });
      prisma.platformSetting.findUnique.mockResolvedValue({ value: 0.2 });
      prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.APPROVED });

      await service.approve('b1', 'admin-1');

      expect(memberships.startTrialIfMissing).not.toHaveBeenCalled();
    });

    it('starts a membership when the business is Directory-listed', async () => {
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.PENDING });
      capabilities.getMap.mockResolvedValue({ DIRECTORY_LISTING: true, SELLS_PRODUCTS: false });
      prisma.platformSetting.findUnique.mockResolvedValue({ value: 0.2 });
      prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.APPROVED });

      await service.approve('b1', 'admin-1');

      expect(memberships.startTrialIfMissing).toHaveBeenCalledWith('b1');
    });
  });

  describe('listCommissionsForAdmin (§26) — real GMV × current rate, never a fabricated figure', () => {
    it('computes estimated revenue from the real sales total and the latest commission rate', async () => {
      prisma.business.findMany.mockResolvedValue([{ id: 'b1', tradeName: 'Biz', status: BusinessStatus.ACTIVE }]);
      prisma.order.groupBy.mockResolvedValue([{ businessId: 'b1', _count: { _all: 3 }, _sum: { subtotal: 100 } }]);
      prisma.commission.findMany.mockResolvedValue([{ businessId: 'b1', rate: 0.15, effectiveFrom: new Date() }]);

      const [result] = await service.listCommissionsForAdmin();

      expect(result.gmv).toBe(100);
      expect(result.commissionRate).toBe(0.15);
      expect(result.estimatedRevenue).toBe(15);
    });

    it('a business with no Commission row yet gets a null rate/revenue, never a guessed default', async () => {
      prisma.business.findMany.mockResolvedValue([{ id: 'b1', tradeName: 'Biz', status: BusinessStatus.PENDING }]);
      prisma.commission.findMany.mockResolvedValue([]);

      const [result] = await service.listCommissionsForAdmin();

      expect(result.commissionRate).toBeNull();
      expect(result.estimatedRevenue).toBeNull();
    });
  });

  it('listCommissionHistory returns every rate change for a business, newest first', async () => {
    await service.listCommissionHistory('b1');
    expect(prisma.commission.findMany).toHaveBeenCalledWith({
      where: { businessId: 'b1' },
      orderBy: { effectiveFrom: 'desc' },
    });
  });

  describe('getCommissionSummary — same real GMV × current-rate math, scoped to one business', () => {
    it('computes estimated revenue for a single business without pulling the whole platform list', async () => {
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', tradeName: 'Biz', status: BusinessStatus.ACTIVE });
      prisma.order.groupBy.mockResolvedValue([{ businessId: 'b1', _count: { _all: 2 }, _sum: { subtotal: 50 } }]);
      prisma.commission.findFirst.mockResolvedValue({ businessId: 'b1', rate: 0.15, effectiveFrom: new Date() });

      const result = await service.getCommissionSummary('b1');

      expect(result.gmv).toBe(50);
      expect(result.commissionRate).toBe(0.15);
      expect(result.estimatedRevenue).toBe(7.5);
    });

    it('a business with no Commission row yet gets a null rate/revenue, never a guessed default', async () => {
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', tradeName: 'Biz', status: BusinessStatus.PENDING });
      prisma.commission.findFirst.mockResolvedValue(null);

      const result = await service.getCommissionSummary('b1');

      expect(result.commissionRate).toBeNull();
      expect(result.estimatedRevenue).toBeNull();
    });
  });

  describe('default commission rate — Admin-facing (Precios y comisiones > Negocios)', () => {
    it('reads the same PlatformSetting key approve() falls back to', async () => {
      prisma.platformSetting.findUnique.mockResolvedValue({ value: 0.18 });

      const rate = await service.getDefaultCommissionRateForAdmin();

      expect(rate).toBe(0.18);
      expect(prisma.platformSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'default_commission_rate' } });
    });

    it('upserts the rate, auditable via updatedBy', async () => {
      await service.setDefaultCommissionRate(0.22, 'admin-1');

      expect(prisma.platformSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'default_commission_rate' },
        update: { value: 0.22, updatedBy: 'admin-1' },
        create: { key: 'default_commission_rate', value: 0.22, updatedBy: 'admin-1' },
      });
    });
  });

  describe('connect/disconnect toggle', () => {
    const businessRow = {
      id: 'b1',
      tradeName: 'Biz',
      openingHours: null,
      manualOverride: null,
      manualOverrideAt: null,
      categories: [],
      documents: [],
      species: [],
    };

    it('getOne() includes the computed effective onlineStatus alongside the record', async () => {
      prisma.business.findUnique.mockResolvedValue({ ...businessRow, manualOverride: 'OFFLINE' });

      const result = await service.getOne('b1');

      expect(result.onlineStatus).toMatchObject({ online: false, source: 'MANUAL' });
    });

    it('setOnlineOverride(ONLINE) persists the override and its timestamp, and returns the new effective status', async () => {
      prisma.business.update.mockResolvedValue({ openingHours: null, manualOverride: 'ONLINE' });

      const result = await service.setOnlineOverride('b1', 'ONLINE' as any);

      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { manualOverride: 'ONLINE', manualOverrideAt: expect.any(Date) },
        select: { openingHours: true, manualOverride: true, manualOverrideAt: true },
      });
      expect(result).toMatchObject({ manualOverride: 'ONLINE', online: true, source: 'MANUAL' });
    });

    it('setOnlineOverride(null) clears the override back to "automático" — still stamps manualOverrideAt (see schema comment: it records the moment control was handed back, too)', async () => {
      prisma.business.update.mockResolvedValue({ openingHours: null, manualOverride: null });

      await service.setOnlineOverride('b1', null);

      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { manualOverride: null, manualOverrideAt: expect.any(Date) },
        select: { openingHours: true, manualOverride: true, manualOverrideAt: true },
      });
    });
  });
});
