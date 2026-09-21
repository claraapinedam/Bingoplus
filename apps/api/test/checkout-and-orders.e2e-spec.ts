import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RoleName } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * FASE 3 — Marketplace critical path (§62), stock concurrency (§66), payment idempotency (§67),
 * and ownership (§70). Directory coupons are covered separately in
 * directory-coupons.e2e-spec.ts — they never touch Cart/Checkout/Payment/Order (§3/64).
 */
describe('BINGO+ API — FASE 3 Checkout & Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const businessCategorySlug = `e2e-fase3-tiendas-${suffix}`;
  const productCategorySlug = `e2e-fase3-alimento-${suffix}`;

  let customerToken: string;
  let ownerToken: string;
  let adminToken: string;
  let businessId: string;
  let directoryOnlyBusinessId: string;
  let addressId: string;

  async function register(email: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'E2E', lastName: 'Fase3' })
      .expect(201);
  }

  async function createBusiness(ownerToken: string, tradeName: string, sellsProducts: boolean) {
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
        sellsProducts,
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
    return id;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // rawBody: true — needed to exercise POST /payments/webhooks/:provider for real (§22): the
    // signature is computed over the exact raw bytes, not the parsed-then-reserialized JSON body.
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
      create: { name: 'E2E FASE3 Tiendas', slug: businessCategorySlug },
    });
    await prisma.productCategory.upsert({
      where: { slug: productCategorySlug },
      update: {},
      create: { name: 'E2E FASE3 Alimento', slug: productCategorySlug },
    });

    const passwordHash = await import('argon2').then((a) => a.hash('SuperSecret123!'));
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
    await prisma.user.create({
      data: {
        email: `e2e.fase3admin.${suffix}@example-bingoplus.test`,
        passwordHash,
        firstName: 'E2E',
        lastName: 'Fase3Admin',
        isEmailVerified: true,
        roles: { create: { roleId: adminRole.id } },
      },
    });
    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `e2e.fase3admin.${suffix}@example-bingoplus.test`, password: 'SuperSecret123!' })
        .expect(200)
    ).body.data.accessToken;

    const customerRes = await register(`e2e.fase3customer.${suffix}@example-bingoplus.test`);
    customerToken = customerRes.body.data.accessToken;

    const ownerRes = await register(`e2e.fase3owner.${suffix}@example-bingoplus.test`);
    ownerToken = ownerRes.body.data.accessToken;

    businessId = await createBusiness(ownerToken, `E2E Fase3 Store ${suffix}`, true);
    directoryOnlyBusinessId = await createBusiness(ownerToken, `E2E Fase3 Vet ${suffix}`, false);

    const addressRes = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ label: 'Casa', line1: 'Av. Siempre Viva 123', city: 'Quito' })
      .expect(201);
    addressId = addressRes.body.data.id;
  });

  afterAll(async () => {
    const orderIds = (
      await prisma.order.findMany({ where: { businessId: { in: [businessId, directoryOnlyBusinessId] } }, select: { id: true } })
    ).map((o) => o.id);
    // Refund/Transaction/Payment all reference Order without a cascade — they must go first,
    // same lesson as the dev seed's resetDevData() ordering.
    await prisma.transaction.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { businessId: { in: [businessId, directoryOnlyBusinessId] } } });
    // A validate()-only test never clears the cart (only create-payment does) — a leftover cart
    // would otherwise block deleting the business it points at.
    await prisma.cart.deleteMany({ where: { businessId: { in: [businessId, directoryOnlyBusinessId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [businessId, directoryOnlyBusinessId] } } });
    await prisma.productCategory.deleteMany({ where: { slug: productCategorySlug } });
    await prisma.businessCategory.deleteMany({ where: { slug: businessCategorySlug } });
    await prisma.user.deleteMany({ where: { email: { contains: `.${suffix}@` } } });
    await app.close();
  });

  describe('§64 — Marketplace vs Directory capability separation', () => {
    it('a business without SELLS_PRODUCTS cannot be checked out even if it somehow has a product', async () => {
      const product = await request(app.getHttpServer())
        .post(`/api/v1/business/${directoryOnlyBusinessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Consulta', categorySlug: productCategorySlug, price: 20, stock: 5 })
        .expect(201);

      const addToCart = await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: product.body.data.id, quantity: 1 })
        .expect(400);
      expect(addToCart.body.error.code).toBe('BUSINESS_NOT_SELLING');

      await prisma.product.delete({ where: { id: product.body.data.id } });
    });
  });

  describe('§62 — full Marketplace happy path: Cart → Checkout → Payment → Order → Business', () => {
    let productId: string;
    let paymentId: string;
    let orderId: string;

    it('creates a product with real stock', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/business/${businessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'E2E Dog Food', categorySlug: productCategorySlug, price: 20, stock: 10 })
        .expect(201);
      productId = res.body.data.id;
    });

    it('adds the product to the cart', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId, quantity: 2 })
        .expect(201);
      expect(res.body.data.businessId).toBe(businessId);
    });

    it('validates checkout and returns a server-computed total, never trusting a client value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentType: 'PICKUP' })
        .expect(201);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.subtotal).toBe(40); // 2 * 20
      expect(res.body.data.total).toBe(40); // no fees configured in this test run
    });

    it('creates the payment, reserving stock and creating the Order transactionally', async () => {
      const idempotencyKey = `e2e-idem-${suffix}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout/create-payment')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentType: 'PICKUP', idempotencyKey })
        .expect(201);

      orderId = res.body.data.order.id;
      paymentId = res.body.data.payment.id;
      expect(res.body.data.order.status).toBe('PAYMENT_PENDING');
      expect(res.body.data.payment.status).toBe('PENDING');

      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(product.stock).toBe(8); // 10 - 2 reserved

      // §67: a retried request with the same idempotencyKey never creates a second Payment.
      const retry = await request(app.getHttpServer())
        .post('/api/v1/checkout/create-payment')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentType: 'PICKUP', idempotencyKey })
        .expect(201);
      // The cart was already consumed by the first call, so the retry's own inputs differ —
      // what matters is the Payment layer itself: confirm the same idempotencyKey never yields
      // two Payment rows.
      const paymentsWithKey = await prisma.payment.count({ where: { idempotencyKey } });
      expect(paymentsWithKey).toBe(1);
      void retry;
    });

    it('confirms the payment — Order moves PAYMENT_PENDING -> PAID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout/confirm')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentId })
        .expect(201);
      expect(res.body.data.status).toBe('PAID');
    });

    it('the business sees the new order and walks it through CONFIRMED -> PREPARING -> READY_FOR_PICKUP -> COMPLETED', async () => {
      const list = await request(app.getHttpServer())
        .get(`/api/v1/me/business/${businessId}/orders`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(list.body.data.some((o: any) => o.id === orderId)).toBe(true);

      for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED']) {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/me/business/${businessId}/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ status })
          .expect(200);
        expect(res.body.data.status).toBe(status);
      }
    });

    it('a business cannot skip straight to a non-adjacent status', async () => {
      // Set up a second order stuck at CONFIRMED to attempt an illegal jump from.
      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId, quantity: 1 })
        .expect(201);
      const created = await request(app.getHttpServer())
        .post('/api/v1/checkout/create-payment')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentType: 'PICKUP', idempotencyKey: `e2e-idem-jump-${suffix}` })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/checkout/confirm')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentId: created.body.data.payment.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/me/business/${businessId}/orders/${created.body.data.order.id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'COMPLETED' })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_ORDER_TRANSITION');
    });

    it('the customer sees the completed order in their history and detail view', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(list.body.data.some((o: any) => o.id === orderId)).toBe(true);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(detail.body.data.status).toBe('COMPLETED');
      expect(detail.body.data.items[0].nameSnapshot).toBe('E2E Dog Food');
    });
  });

  describe('§22 — payment webhook, exercised over real HTTP (not just the service layer)', () => {
    it('the sandbox webhook simulator is a real, ownership-checked way to hit POST /payments/webhooks/sandbox', async () => {
      const product = await request(app.getHttpServer())
        .post(`/api/v1/business/${businessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'E2E Webhook Item', categorySlug: productCategorySlug, price: 9, stock: 5 })
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
        .send({ fulfillmentType: 'PICKUP', idempotencyKey: `e2e-webhook-${suffix}` })
        .expect(201);
      const paymentId = created.body.data.payment.id;
      const orderId = created.body.data.order.id;
      expect(created.body.data.payment.status).toBe('PENDING');

      // A different customer can't simulate a webhook for someone else's payment.
      const other = await register(`e2e.fase3webhookother.${suffix}@example-bingoplus.test`);
      await request(app.getHttpServer())
        .post('/api/v1/payments/sandbox/simulate-webhook')
        .set('Authorization', `Bearer ${other.body.data.accessToken}`)
        .send({ paymentId, status: 'PAID' })
        .expect(403);

      const sim = await request(app.getHttpServer())
        .post('/api/v1/payments/sandbox/simulate-webhook')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentId, status: 'PAID' })
        .expect(201);
      expect(sim.body.data.rawBody).toBeDefined();
      expect(sim.body.data.signatureHeader).toBeDefined();

      // An unsigned/garbage signature is rejected before anything is applied.
      await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', 'not-the-real-signature')
        .send(sim.body.data.rawBody)
        .expect(400);

      // The real, correctly-signed request goes through the actual HTTP endpoint end-to-end:
      // signature verification -> WebhookEvent idempotency -> Payment update -> Order sync.
      await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', sim.body.data.signatureHeader)
        .send(sim.body.data.rawBody)
        .expect(201);

      const order = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(order.body.data.status).toBe('PAID');
      expect(order.body.data.payment.status).toBe('PAID');

      // §22 idempotency: redelivering the exact same webhook is a no-op, not a second apply.
      const redelivery = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', sim.body.data.signatureHeader)
        .send(sim.body.data.rawBody)
        .expect(201);
      expect(redelivery.body.data.duplicate).toBe(true);
    });
  });

  describe('§66 — stock race condition', () => {
    it('never lets stock go negative: exactly one of two concurrent buyers of the last unit succeeds', async () => {
      const product = await request(app.getHttpServer())
        .post(`/api/v1/business/${businessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'E2E Last Unit', categorySlug: productCategorySlug, price: 15, stock: 1 })
        .expect(201);
      const productId = product.body.data.id;

      const buyerA = await register(`e2e.fase3buyera.${suffix}@example-bingoplus.test`);
      const buyerB = await register(`e2e.fase3buyerb.${suffix}@example-bingoplus.test`);

      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${buyerA.body.data.accessToken}`)
        .send({ productId, quantity: 1 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${buyerB.body.data.accessToken}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/checkout/create-payment')
          .set('Authorization', `Bearer ${buyerA.body.data.accessToken}`)
          .send({ fulfillmentType: 'PICKUP', idempotencyKey: `e2e-race-a-${suffix}` }),
        request(app.getHttpServer())
          .post('/api/v1/checkout/create-payment')
          .set('Authorization', `Bearer ${buyerB.body.data.accessToken}`)
          .send({ fulfillmentType: 'PICKUP', idempotencyKey: `e2e-race-b-${suffix}` }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 400]);
      const failed = resA.status === 400 ? resA : resB;
      expect(failed.body.error.code).toBe('PRODUCT_OUT_OF_STOCK');

      const finalProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(finalProduct.stock).toBe(0); // never negative
    });
  });

  describe('§35 — cancellation', () => {
    it('a customer can cancel before PREPARING, releasing stock and refunding a paid order', async () => {
      const product = await request(app.getHttpServer())
        .post(`/api/v1/business/${businessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'E2E Cancel Me', categorySlug: productCategorySlug, price: 12, stock: 5 })
        .expect(201);
      const productId = product.body.data.id;

      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId, quantity: 1 })
        .expect(201);
      const created = await request(app.getHttpServer())
        .post('/api/v1/checkout/create-payment')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentType: 'PICKUP', idempotencyKey: `e2e-cancel-${suffix}` })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/checkout/confirm')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentId: created.body.data.payment.id })
        .expect(201);

      const cancelled = await request(app.getHttpServer())
        .post(`/api/v1/orders/${created.body.data.order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'e2e test' })
        .expect(201);
      expect(cancelled.body.data.status).toBe('CANCELLED');

      const restockedProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(restockedProduct.stock).toBe(5); // fully released

      const refunds = await prisma.refund.findMany({ where: { orderId: created.body.data.order.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0].status).toBe('COMPLETED');
    });
  });

  describe('§70 — ownership', () => {
    it('a customer cannot read another customer\'s order', async () => {
      const otherCustomer = await register(`e2e.fase3other.${suffix}@example-bingoplus.test`);
      const orders = await prisma.order.findMany({ where: { businessId }, take: 1 });
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orders[0].id}`)
        .set('Authorization', `Bearer ${otherCustomer.body.data.accessToken}`)
        .expect(403);
    });

    it('a business cannot read an order belonging to a different business', async () => {
      const otherOwner = await register(`e2e.fase3otherowner.${suffix}@example-bingoplus.test`);
      const otherBusinessId = await createBusiness(otherOwner.body.data.accessToken, `E2E Other Fase3 ${suffix}`, true);
      const orders = await prisma.order.findMany({ where: { businessId }, take: 1 });

      await request(app.getHttpServer())
        .get(`/api/v1/me/business/${otherBusinessId}/orders/${orders[0].id}`)
        .set('Authorization', `Bearer ${otherOwner.body.data.accessToken}`)
        .expect(403);

      await prisma.business.delete({ where: { id: otherBusinessId } });
    });
  });

  describe('§13/15 — DELIVERY fulfillment requires an address', () => {
    it('rejects DELIVERY when the business has not enabled it', async () => {
      // replaceCart only kicks in when switching to a *different* business's cart — clear
      // explicitly first so this test starts from a known, empty cart regardless of what an
      // earlier test in this file left behind for the same business.
      await request(app.getHttpServer()).delete('/api/v1/me/cart').set('Authorization', `Bearer ${customerToken}`);
      const product = await request(app.getHttpServer())
        .post(`/api/v1/business/${businessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'E2E Delivery Precheck', categorySlug: productCategorySlug, price: 5, stock: 5 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: product.body.data.id, quantity: 1 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentType: 'DELIVERY', addressId })
        .expect(400);
      expect(res.body.error.code).toBe('FULFILLMENT_NOT_AVAILABLE');
    });

    it('once DELIVERY is enabled, rejects checkout without an address, and accepts it with one', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/businesses/${businessId}/capabilities`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capability: 'DELIVERY', enabled: true })
        .expect(200);

      await request(app.getHttpServer()).delete('/api/v1/me/cart').set('Authorization', `Bearer ${customerToken}`);
      const product = await request(app.getHttpServer())
        .post(`/api/v1/business/${businessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'E2E Delivery Item', categorySlug: productCategorySlug, price: 8, stock: 5 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: product.body.data.id, quantity: 1 })
        .expect(201);

      const missingAddress = await request(app.getHttpServer())
        .post('/api/v1/checkout/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentType: 'DELIVERY' })
        .expect(400);
      expect(missingAddress.body.error.code).toBe('ADDRESS_REQUIRED');

      const withAddress = await request(app.getHttpServer())
        .post('/api/v1/checkout/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fulfillmentType: 'DELIVERY', addressId })
        .expect(201);
      expect(withAddress.body.data.valid).toBe(true);
      expect(withAddress.body.data.address.id).toBe(addressId);
    });
  });

  describe('§65 — cannot manipulate price from the client', () => {
    it('ignores a client-supplied total/subtotal and recomputes from live product prices', async () => {
      await request(app.getHttpServer()).delete('/api/v1/me/cart').set('Authorization', `Bearer ${customerToken}`);
      const product = await request(app.getHttpServer())
        .post(`/api/v1/business/${businessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'E2E Price Check', categorySlug: productCategorySlug, price: 50, stock: 5 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/me/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: product.body.data.id, quantity: 1 })
        .expect(201);

      // Deliberately smuggling in extra client-controlled pricing fields — DTO validation
      // (`whitelist: true`) strips any field CheckoutValidateDto doesn't declare, so the service
      // never even sees them; the total below is entirely server-computed either way.
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout/validate')
        .send({ fulfillmentType: 'PICKUP', total: 1, subtotal: 1, discount: 999 })
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(201);
      expect(res.body.data.total).toBe(50); // the real, server-computed price — not 1
    });
  });
});
