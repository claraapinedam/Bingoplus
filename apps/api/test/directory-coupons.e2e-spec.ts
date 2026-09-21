import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RoleName } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * FASE 3 — Directory coupon QR + redemption critical path (§63), the coupon-visibility rule, and
 * the hard boundary that this flow never creates a Payment or an Order (§3/45/64) — Directory
 * coupons are settled directly between customer and business, BINGO+ never processes that money.
 */
describe('BINGO+ API — FASE 3 Directory Coupons (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const businessCategorySlug = `e2e-fase3-coupons-cat-${suffix}`;

  let customerToken: string;
  let customerId: string;
  let ownerToken: string;
  let adminToken: string;
  let businessId: string; // DIRECTORY_LISTING + COUPONS, no products
  let noCouponsBusinessId: string; // DIRECTORY_LISTING only, COUPONS capability off

  async function register(email: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'E2E', lastName: 'Coupon' })
      .expect(201);
  }

  async function createDirectoryBusiness(tradeName: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/me/business')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        tradeName,
        legalName: `${tradeName} S.A.S.`,
        taxId: `179${Math.random().toString().slice(2, 12)}`,
        email: `${tradeName.replace(/\s/g, '').toLowerCase()}.${suffix}@example-bingoplus.test`,
        phone: '+593999000000',
        categorySlugs: [businessCategorySlug],
        addressLine: 'Av. Test 1',
        city: 'Quito',
        sellsProducts: false,
      })
      .expect(201);
    const id = res.body.data.id;
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/businesses/${id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/businesses/${id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    // SERVICES so the business is genuinely Directory-worthy (RULE 5 refinement).
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/businesses/${id}/capabilities`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capability: 'SERVICES', enabled: true })
      .expect(200);
    return id;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    for (const name of Object.values(RoleName)) {
      await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    }
    await prisma.businessCategory.upsert({
      where: { slug: businessCategorySlug },
      update: {},
      create: { name: 'E2E FASE3 Coupons Cat', slug: businessCategorySlug },
    });

    const passwordHash = await import('argon2').then((a) => a.hash('SuperSecret123!'));
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
    await prisma.user.create({
      data: {
        email: `e2e.fase3couponadmin.${suffix}@example-bingoplus.test`,
        passwordHash,
        firstName: 'E2E',
        lastName: 'CouponAdmin',
        isEmailVerified: true,
        roles: { create: { roleId: adminRole.id } },
      },
    });
    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `e2e.fase3couponadmin.${suffix}@example-bingoplus.test`, password: 'SuperSecret123!' })
        .expect(200)
    ).body.data.accessToken;

    const customerRes = await register(`e2e.fase3couponcustomer.${suffix}@example-bingoplus.test`);
    customerToken = customerRes.body.data.accessToken;
    customerId = customerRes.body.data.user.id;

    const ownerRes = await register(`e2e.fase3couponowner.${suffix}@example-bingoplus.test`);
    ownerToken = ownerRes.body.data.accessToken;

    businessId = await createDirectoryBusiness(`E2E Coupon Business ${suffix}`);
    noCouponsBusinessId = await createDirectoryBusiness(`E2E No Coupons Business ${suffix}`);

    // Grant COUPONS only to `businessId`.
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/businesses/${businessId}/capabilities`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capability: 'COUPONS', enabled: true })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.couponRedemption.deleteMany({ where: { businessId: { in: [businessId, noCouponsBusinessId] } } });
    await prisma.businessCoupon.deleteMany({ where: { businessId: { in: [businessId, noCouponsBusinessId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [businessId, noCouponsBusinessId] } } });
    await prisma.businessCategory.deleteMany({ where: { slug: businessCategorySlug } });
    await prisma.user.deleteMany({ where: { email: { contains: `.${suffix}@` } } });
    await app.close();
  });

  describe('Coupon visibility rule — three states', () => {
    it('COUPONS=false: couponSummary reports no active coupons without exposing any "Ver cupón" state', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/businesses/${noCouponsBusinessId}`)
        .expect(200);
      expect(res.body.data.capabilities.COUPONS).toBe(false);
      expect(res.body.data.couponSummary).toEqual({ hasActiveCoupons: false, count: 0 });
    });

    it('COUPONS=true but zero active coupons: still reports hasActiveCoupons=false', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/businesses/${businessId}`)
        .expect(200);
      expect(res.body.data.capabilities.COUPONS).toBe(true);
      expect(res.body.data.couponSummary).toEqual({ hasActiveCoupons: false, count: 0 });
    });
  });

  describe('§40-51 — full coupon QR + redemption critical path', () => {
    let couponId: string;
    let redemptionToken: string;

    it('business creates and activates a coupon', async () => {
      const create = await request(app.getHttpServer())
        .post(`/api/v1/me/business/${businessId}/coupons`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          code: `WELCOME-${suffix}`,
          title: '15% off first visit',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          minimumPurchase: 10,
          maximumDiscount: 20,
          startDate: new Date(Date.now() - 86_400_000).toISOString(),
          expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
          usagePerCustomer: 1,
        })
        .expect(201);
      couponId = create.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/me/business/${businessId}/coupons/${couponId}/activate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
    });

    it('couponSummary now reports the active coupon, and "Ver cupón" is warranted', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/businesses/${businessId}`)
        .expect(200);
      expect(res.body.data.couponSummary).toEqual({ hasActiveCoupons: true, count: 1 });
    });

    it('customer views the public coupon detail (no login required)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/public/coupons/${couponId}`).expect(200);
      expect(res.body.data.title).toBe('15% off first visit');
      expect(res.body.data.business.id).toBe(businessId);
    });

    it('customer requests the QR — a secure token, never the discount amount', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/me/coupons/${couponId}/qr`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data).not.toHaveProperty('discountValue');
      redemptionToken = res.body.data.token;
    });

    it('customer downloads the QR as an image — same token, rendered as a data URL', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/me/coupons/${couponId}/qr/download`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('business validates (dry run) without creating a redemption', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/me/business/${businessId}/coupons/validate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ token: redemptionToken, purchaseAmount: 50 })
        .expect(201);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.estimatedDiscount).toBe(7.5); // 15% of 50

      const count = await prisma.couponRedemption.count({ where: { couponId } });
      expect(count).toBe(0);
    });

    it('business redeems the coupon — records exactly one CouponRedemption, no Payment, no Order', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/me/business/${businessId}/coupons/redeem`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ token: redemptionToken, purchaseAmount: 50 })
        .expect(201);

      expect(res.body.data.couponId).toBe(couponId);
      expect(res.body.data.customerId).toBe(customerId);
      expect(Number(res.body.data.discountAmount)).toBe(7.5);

      const paymentsForCustomer = await prisma.payment.count({ where: { order: { userId: customerId } } });
      const ordersForCustomer = await prisma.order.count({ where: { userId: customerId } });
      expect(paymentsForCustomer).toBe(0);
      expect(ordersForCustomer).toBe(0);
    });

    it('shows up in the business\'s redemption history', async () => {
      const list = await request(app.getHttpServer())
        .get(`/api/v1/me/business/${businessId}/coupons/redemptions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(list.body.data.some((r: any) => r.couponId === couponId)).toBe(true);
    });

    it('a second redemption of the same token is rejected — COUPON_CUSTOMER_LIMIT_REACHED (usagePerCustomer=1)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/me/business/${businessId}/coupons/redeem`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ token: redemptionToken, purchaseAmount: 50 })
        .expect(400);
      expect(res.body.error.code).toBe('COUPON_CUSTOMER_LIMIT_REACHED');

      const count = await prisma.couponRedemption.count({ where: { couponId } });
      expect(count).toBe(1); // never duplicated
    });
  });

  describe('§49 — business coupon ownership', () => {
    it('Business A cannot validate/redeem/manage a coupon belonging to Business B', async () => {
      const otherOwner = await register(`e2e.fase3couponother.${suffix}@example-bingoplus.test`);
      const otherBusinessId = await createDirectoryBusiness(`E2E Other Coupon Biz ${suffix}`);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/businesses/${otherBusinessId}/capabilities`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capability: 'COUPONS', enabled: true })
        .expect(200);

      const coupon = await request(app.getHttpServer())
        .post(`/api/v1/me/business/${businessId}/coupons`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          code: `OWNERSHIP-${suffix}`,
          title: 'Ownership test coupon',
          discountType: 'FIXED_AMOUNT',
          discountValue: 5,
          startDate: new Date(Date.now() - 1000).toISOString(),
          expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);

      // Business B's owner has no BusinessUser membership on Business A at all → 403 at the guard,
      // before CouponsService is ever reached.
      await request(app.getHttpServer())
        .patch(`/api/v1/me/business/${businessId}/coupons/${coupon.body.data.id}/activate`)
        .set('Authorization', `Bearer ${otherOwner.body.data.accessToken}`)
        .expect(403);

      await prisma.business.delete({ where: { id: otherBusinessId } });
    });

    it('redeeming a coupon at the wrong business is rejected — COUPON_WRONG_BUSINESS', async () => {
      const coupon = await request(app.getHttpServer())
        .post(`/api/v1/me/business/${businessId}/coupons`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          code: `WRONGBIZ-${suffix}`,
          title: 'Wrong business test',
          discountType: 'FIXED_AMOUNT',
          discountValue: 5,
          startDate: new Date(Date.now() - 1000).toISOString(),
          expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/me/business/${businessId}/coupons/${coupon.body.data.id}/activate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const qr = await request(app.getHttpServer())
        .get(`/api/v1/me/coupons/${coupon.body.data.id}/qr`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      // noCouponsBusinessId's owner (same ownerToken) tries to redeem a coupon that belongs to businessId.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/me/business/${noCouponsBusinessId}/coupons/redeem`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ token: qr.body.data.token })
        .expect(403);
      expect(res.body.error.code).toBe('COUPON_WRONG_BUSINESS');
    });
  });

  describe('§69 — duplicate redemption race', () => {
    it('two concurrent redemption attempts of the same coupon (usageLimit=1) — only one succeeds', async () => {
      const coupon = await request(app.getHttpServer())
        .post(`/api/v1/me/business/${businessId}/coupons`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          code: `RACE-${suffix}`,
          title: 'Race test coupon',
          discountType: 'FIXED_AMOUNT',
          discountValue: 3,
          startDate: new Date(Date.now() - 1000).toISOString(),
          expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
          usageLimit: 1,
        })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/me/business/${businessId}/coupons/${coupon.body.data.id}/activate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const buyerA = await register(`e2e.fase3racea.${suffix}@example-bingoplus.test`);
      const buyerB = await register(`e2e.fase3raceb.${suffix}@example-bingoplus.test`);
      const tokenA = (
        await request(app.getHttpServer())
          .get(`/api/v1/me/coupons/${coupon.body.data.id}/qr`)
          .set('Authorization', `Bearer ${buyerA.body.data.accessToken}`)
          .expect(200)
      ).body.data.token;
      const tokenB = (
        await request(app.getHttpServer())
          .get(`/api/v1/me/coupons/${coupon.body.data.id}/qr`)
          .set('Authorization', `Bearer ${buyerB.body.data.accessToken}`)
          .expect(200)
      ).body.data.token;

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/me/business/${businessId}/coupons/redeem`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ token: tokenA }),
        request(app.getHttpServer())
          .post(`/api/v1/me/business/${businessId}/coupons/redeem`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ token: tokenB }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 400]);

      const totalRedemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.body.data.id } });
      expect(totalRedemptions).toBe(1); // the FOR UPDATE lock made this safe
    });
  });
});
