import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RoleName } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * FASE 4 — Riders + Delivery (§72-79): the critical end-to-end delivery flow (§74), rider
 * rejection/reassignment (§75), location update authorization (§77), ownership (§78), and the
 * delivery-completion race condition (§79). PICKUP/Directory never creating a Delivery is covered
 * in checkout-and-orders.e2e-spec.ts §13/15 and §64 (capability separation is shared, not
 * duplicated here).
 */
describe('BINGO+ API — FASE 4 Delivery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const businessCategorySlug = `e2e-fase4-tiendas-${suffix}`;
  const productCategorySlug = `e2e-fase4-alimento-${suffix}`;

  let customerToken: string;
  let ownerToken: string;
  let adminToken: string;
  let businessId: string;
  let addressId: string;

  let rider1Token: string;
  let rider1UserId: string;
  let rider1Id: string;
  let rider2Token: string;
  let rider2UserId: string;
  let rider2Id: string;

  const BUSINESS_LAT = -0.2;
  const BUSINESS_LNG = -78.5;

  async function register(email: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'E2E', lastName: 'Fase4' })
      .expect(201);
  }

  async function createRiderUser(email: string, firstName: string) {
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash('SuperSecret123!');
    const riderRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.RIDER } });
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName: 'Rider',
        isEmailVerified: true,
        roles: { create: { roleId: riderRole.id } },
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'SuperSecret123!' })
      .expect(200);
    return { userId: user.id, token: login.body.data.accessToken as string };
  }

  /** Onboards a rider to ACTIVE+AVAILABLE at the given coordinates — the state DispatchService
   * requires before it will ever offer them a delivery. */
  async function makeRiderAvailable(token: string, latitude: number, longitude: number) {
    const profile = await request(app.getHttpServer())
      .get('/api/v1/rider/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const riderId = profile.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/riders/${riderId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/rider/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude, longitude })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/rider/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ availabilityStatus: 'AVAILABLE' })
      .expect(201);

    return riderId;
  }

  async function createBusiness(tradeName: string) {
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
        sellsProducts: true,
        latitude: BUSINESS_LAT,
        longitude: BUSINESS_LNG,
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
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/businesses/${id}/capabilities`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capability: 'DELIVERY', enabled: true })
      .expect(200);
    return id;
  }

  /** Buys one product for DELIVERY and drives the order to READY_FOR_PICKUP, returning the
   * created Delivery. Every test in §74/75/77-79 starts from this same setup. */
  async function createReadyDelivery(priceLabel: string) {
    const product = await request(app.getHttpServer())
      .post(`/api/v1/business/${businessId}/products`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `E2E Delivery ${priceLabel}`, categorySlug: productCategorySlug, price: 15, stock: 5 })
      .expect(201);

    await request(app.getHttpServer()).delete('/api/v1/me/cart').set('Authorization', `Bearer ${customerToken}`);
    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId: product.body.data.id, quantity: 1 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/checkout/create-payment')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ fulfillmentType: 'DELIVERY', addressId, idempotencyKey: `e2e-fase4-${priceLabel}-${suffix}` })
      .expect(201);
    const orderId = created.body.data.order.id as string;
    const paymentId = created.body.data.payment.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/checkout/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/me/business/${businessId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/me/business/${businessId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'PREPARING' })
      .expect(200);

    const delivery = await request(app.getHttpServer())
      .post(`/api/v1/me/business/${businessId}/orders/${orderId}/ready-for-pickup`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    return { orderId, deliveryId: delivery.body.data.id as string };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
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
      create: { name: 'E2E FASE4 Tiendas', slug: businessCategorySlug },
    });
    await prisma.productCategory.upsert({
      where: { slug: productCategorySlug },
      update: {},
      create: { name: 'E2E FASE4 Alimento', slug: productCategorySlug },
    });

    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash('SuperSecret123!');
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
    await prisma.user.create({
      data: {
        email: `e2e.fase4admin.${suffix}@example-bingoplus.test`,
        passwordHash,
        firstName: 'E2E',
        lastName: 'Fase4Admin',
        isEmailVerified: true,
        roles: { create: { roleId: adminRole.id } },
      },
    });
    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `e2e.fase4admin.${suffix}@example-bingoplus.test`, password: 'SuperSecret123!' })
        .expect(200)
    ).body.data.accessToken;

    const customerRes = await register(`e2e.fase4customer.${suffix}@example-bingoplus.test`);
    customerToken = customerRes.body.data.accessToken;

    const ownerRes = await register(`e2e.fase4owner.${suffix}@example-bingoplus.test`);
    ownerToken = ownerRes.body.data.accessToken;

    businessId = await createBusiness(`E2E Fase4 Store ${suffix}`);

    const addressRes = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        label: 'Casa',
        line1: 'Av. Siempre Viva 123',
        city: 'Quito',
        latitude: BUSINESS_LAT + 0.01,
        longitude: BUSINESS_LNG + 0.01,
      })
      .expect(201);
    addressId = addressRes.body.data.id;

    const r1 = await createRiderUser(`e2e.fase4rider1.${suffix}@example-bingoplus.test`, 'RiderOne');
    rider1Token = r1.token;
    rider1UserId = r1.userId;
    const r2 = await createRiderUser(`e2e.fase4rider2.${suffix}@example-bingoplus.test`, 'RiderTwo');
    rider2Token = r2.token;
    rider2UserId = r2.userId;

    // Rider 1 is placed exactly at the business (closest) so dispatch always offers it to them
    // first; Rider 2 is nearby but farther, so they're the deterministic fallback candidate.
    rider1Id = await makeRiderAvailable(rider1Token, BUSINESS_LAT, BUSINESS_LNG);
    rider2Id = await makeRiderAvailable(rider2Token, BUSINESS_LAT + 0.02, BUSINESS_LNG + 0.02);
  });

  afterAll(async () => {
    const orderIds = (await prisma.order.findMany({ where: { businessId }, select: { id: true } })).map((o) => o.id);
    const deliveryIds = (await prisma.delivery.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })).map(
      (d) => d.id,
    );
    await prisma.riderLocation.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await prisma.deliveryAssignmentHistory.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await prisma.deliveryIncident.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await prisma.deliveryProof.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await prisma.riderEarning.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await prisma.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.transaction.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.cart.deleteMany({ where: { businessId } });
    await prisma.vehicle.deleteMany({ where: { riderId: { in: [rider1Id, rider2Id] } } });
    await prisma.rider.deleteMany({ where: { id: { in: [rider1Id, rider2Id] } } });
    await prisma.address.deleteMany({ where: { id: addressId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.productCategory.deleteMany({ where: { slug: productCategorySlug } });
    await prisma.businessCategory.deleteMany({ where: { slug: businessCategorySlug } });
    await prisma.user.deleteMany({ where: { id: { in: [rider1UserId, rider2UserId] } } });
    await prisma.user.deleteMany({ where: { email: { contains: `.${suffix}@` } } });
    await app.close();
  });

  describe('§74 — critical end-to-end delivery flow', () => {
    it('Order DELIVERY -> ready-for-pickup creates a Delivery, dispatched to the nearest available rider', async () => {
      const { orderId, deliveryId } = await createReadyDelivery('happy');
      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(delivery.orderId).toBe(orderId);
      expect(delivery.riderId).toBe(rider1Id); // closest candidate
      expect(delivery.status).toBe('RIDER_ASSIGNED');
      expect(Number(delivery.deliveryFee)).toBe(2);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('READY_FOR_PICKUP'); // Order does NOT mirror Delivery's substates

      const proof = await prisma.deliveryProof.findUniqueOrThrow({ where: { deliveryId } });
      expect(proof.type).toBe('OTP');
      expect(proof.code).toMatch(/^\d{6}$/);

      // rider walks the whole task lifecycle
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/accept`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/arrived-pickup`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/picked-up`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/start`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/arrived-customer`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);

      // customer reads the OTP from tracking, rider confirms it
      const otpRes = await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${deliveryId}/otp`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(otpRes.body.data.code).toBe(proof.code);

      const completed = await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/complete`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .send({ otpCode: proof.code })
        .expect(201);
      expect(completed.body.data.status).toBe('DELIVERED');

      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(finalOrder.status).toBe('COMPLETED'); // DeliverySyncService moved it

      const earning = await prisma.riderEarning.findFirstOrThrow({ where: { deliveryId } });
      expect(Number(earning.grossAmount)).toBe(2);
      expect(earning.riderId).toBe(rider1Id);

      const finalRider = await prisma.rider.findUniqueOrThrow({ where: { id: rider1Id } });
      expect(finalRider.availabilityStatus).toBe('AVAILABLE'); // freed up again
      expect(finalRider.deliveriesCompleted).toBe(1);
    });

    it('rejects an incorrect OTP without completing the delivery', async () => {
      const { deliveryId } = await createReadyDelivery('badotp');
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/accept`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/arrived-pickup`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/picked-up`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/start`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/arrived-customer`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);

      const wrong = await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/complete`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .send({ otpCode: '000000' })
        .expect(400);
      expect(wrong.body.error.code).toBe('DELIVERY_OTP_INVALID');

      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(delivery.status).toBe('ARRIVED_AT_CUSTOMER');

      // clean up so it doesn't linger stuck for the rest of the suite
      const proof = await prisma.deliveryProof.findUniqueOrThrow({ where: { deliveryId } });
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/complete`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .send({ otpCode: proof.code })
        .expect(201);
    });
  });

  describe('§75 — rider rejection reassigns to the next eligible rider, never duplicating the delivery', () => {
    it('rider 1 rejects -> delivery is reassigned to rider 2', async () => {
      const { deliveryId } = await createReadyDelivery('reject');
      const initial = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(initial.riderId).toBe(rider1Id);

      const rejected = await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/reject`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .send({ reason: 'e2e reject' })
        .expect(201);
      expect(rejected.body.data.riderId).toBe(rider2Id);
      expect(rejected.body.data.status).toBe('RIDER_ASSIGNED');

      // still exactly one Delivery for this order
      const deliveries = await prisma.delivery.findMany({ where: { orderId: initial.orderId } });
      expect(deliveries).toHaveLength(1);

      const history = await prisma.deliveryAssignmentHistory.findMany({ where: { deliveryId }, orderBy: { createdAt: 'asc' } });
      expect(history.map((h) => h.action)).toEqual(['ASSIGNED', 'REJECTED', 'ASSIGNED']);

      // rider 1 rejecting frees them, not the order — clean up by completing normally with rider 2
      const proof = await prisma.deliveryProof.findUniqueOrThrow({ where: { deliveryId } });
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/accept`)
        .set('Authorization', `Bearer ${rider2Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/arrived-pickup`)
        .set('Authorization', `Bearer ${rider2Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/picked-up`)
        .set('Authorization', `Bearer ${rider2Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/start`)
        .set('Authorization', `Bearer ${rider2Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/arrived-customer`)
        .set('Authorization', `Bearer ${rider2Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/complete`)
        .set('Authorization', `Bearer ${rider2Token}`)
        .send({ otpCode: proof.code })
        .expect(201);
    });
  });

  describe('§77 — location updates require an active assignment', () => {
    it('a rider not assigned to the delivery cannot post a location update for it', async () => {
      const { deliveryId } = await createReadyDelivery('location');
      // rider1 is the assigned one; rider2 tries to post a location update for it
      const res = await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/location`)
        .set('Authorization', `Bearer ${rider2Token}`)
        .send({ latitude: BUSINESS_LAT, longitude: BUSINESS_LNG })
        .expect(403);
      expect(res.body).toBeDefined();

      // and even the assigned rider can't post one before actually starting the delivery
      // (RIDER_ASSIGNED isn't in the "active tracking" set yet — only RIDER_ACCEPTED onward is)
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/location`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .send({ latitude: BUSINESS_LAT, longitude: BUSINESS_LNG })
        .expect(403);

      // clean up: reject so it doesn't linger assigned to rider1 for later tests, then admin-cancel
      await prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await prisma.rider.update({ where: { id: rider1Id }, data: { availabilityStatus: 'AVAILABLE' } });
    });
  });

  describe('§78 — ownership', () => {
    it('a customer cannot read another customer\'s delivery tracking', async () => {
      const { orderId } = await createReadyDelivery('own-cust');
      const otherCustomer = await register(`e2e.fase4othercust.${suffix}@example-bingoplus.test`);
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}/tracking`)
        .set('Authorization', `Bearer ${otherCustomer.body.data.accessToken}`)
        .expect(403);

      // clean up — cancel so it doesn't block business/product deletion at afterAll
      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { orderId } });
      await prisma.delivery.update({ where: { id: delivery.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await prisma.rider.update({ where: { id: rider1Id }, data: { availabilityStatus: 'AVAILABLE' } });
    });

    it("a rider cannot read a delivery assigned to a different rider", async () => {
      const { deliveryId } = await createReadyDelivery('own-rider');
      await request(app.getHttpServer())
        .get(`/api/v1/rider/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${rider2Token}`)
        .expect(403);

      await prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await prisma.rider.update({ where: { id: rider1Id }, data: { availabilityStatus: 'AVAILABLE' } });
    });
  });

  describe('§79 — delivery completion race condition', () => {
    it('two simultaneous complete() requests result in exactly one DELIVERED transition, one RiderEarning', async () => {
      const { deliveryId } = await createReadyDelivery('race');
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/accept`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/arrived-pickup`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/picked-up`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/start`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/rider/deliveries/${deliveryId}/arrived-customer`)
        .set('Authorization', `Bearer ${rider1Token}`)
        .expect(201);

      const proof = await prisma.deliveryProof.findUniqueOrThrow({ where: { deliveryId } });
      const before = await prisma.rider.findUniqueOrThrow({ where: { id: rider1Id } });

      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/rider/deliveries/${deliveryId}/complete`)
          .set('Authorization', `Bearer ${rider1Token}`)
          .send({ otpCode: proof.code }),
        request(app.getHttpServer())
          .post(`/api/v1/rider/deliveries/${deliveryId}/complete`)
          .set('Authorization', `Bearer ${rider1Token}`)
          .send({ otpCode: proof.code }),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]); // idempotent — neither request errors

      const earnings = await prisma.riderEarning.findMany({ where: { deliveryId } });
      expect(earnings).toHaveLength(1); // never double-credited

      const finalRider = await prisma.rider.findUniqueOrThrow({ where: { id: rider1Id } });
      expect(finalRider.deliveriesCompleted).toBe(before.deliveriesCompleted + 1); // incremented exactly once, not twice
    });
  });
});
