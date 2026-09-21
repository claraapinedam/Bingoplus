import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RoleName } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Critical-path e2e for Phase 2: browse categories/products with filters, manage a business's
 * catalog (create/stock/activate/deactivate), and the full cart lifecycle including the
 * cross-business conflict and stock-limit rules.
 *
 * Requires a real Postgres reachable at process.env.DATABASE_URL (see docker-compose.yml).
 */
describe('BINGO+ API — Phase 2 critical path (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const ownerEmail = `e2e.owner.${suffix}@example-bingoplus.test`;
  const shopperEmail = `e2e.shopper.${suffix}@example-bingoplus.test`;
  const adminEmail = `e2e.catalogadmin.${suffix}@example-bingoplus.test`;
  const categorySlug = `e2e-alimento-${suffix}`;
  const businessCategorySlug = `e2e-tiendas-${suffix}`;

  let ownerToken: string;
  let shopperToken: string;
  let businessId: string;
  let productId: string;
  let otherBusinessId: string;
  let otherProductId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
      create: { name: 'E2E Tiendas', slug: businessCategorySlug },
    });
    await prisma.productCategory.upsert({
      where: { slug: categorySlug },
      update: {},
      create: { name: 'E2E Alimento', slug: categorySlug },
    });

    // Owner + a second ACTIVE business so we can prove the cart's cross-business conflict.
    const register = async (email: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'SuperSecret123!', firstName: 'E2E', lastName: 'Phase2' })
        .expect(201);

    const ownerRes = await register(ownerEmail);
    ownerToken = ownerRes.body.data.accessToken;
    const shopperRes = await register(shopperEmail);
    shopperToken = shopperRes.body.data.accessToken;

    const passwordHash = await import('argon2').then((a) => a.hash('SuperSecret123!'));
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'E2E',
        lastName: 'CatalogAdmin',
        isEmailVerified: true,
        roles: { create: { roleId: adminRole.id } },
      },
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'SuperSecret123!' })
      .expect(200);
    const adminToken = adminLogin.body.data.accessToken;

    async function createActiveBusiness(tradeName: string) {
      const applyRes = await request(app.getHttpServer())
        .post('/api/v1/me/business')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          tradeName,
          legalName: `${tradeName} S.A.S.`,
          taxId: `179000${Math.random().toString().slice(2, 10)}`,
          email: `${tradeName.replace(/\s/g, '').toLowerCase()}@example-bingoplus.test`,
          phone: '+593999000000',
          categorySlugs: [businessCategorySlug],
          addressLine: 'Av. Test 1',
          city: 'Quito',
          sellsProducts: true,
        })
        .expect(201);
      const id = applyRes.body.data.id;
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

    businessId = await createActiveBusiness(`E2E Store ${suffix}`);
    otherBusinessId = await createActiveBusiness(`E2E Other Store ${suffix}`);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
    await prisma.productCategory.deleteMany({ where: { slug: categorySlug } });
    await prisma.businessCategory.deleteMany({ where: { slug: businessCategorySlug } });
    // Scoped to this run's own suffix so parallel e2e spec files never race on cleanup.
    await prisma.user.deleteMany({ where: { email: { contains: `.${suffix}@` } } });
    await app.close();
  });

  it('creates a product for the business and it is visible in the public catalog', async () => {
    const create = await request(app.getHttpServer())
      .post(`/api/v1/business/${businessId}/products`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'E2E Dog Food', categorySlug, price: 20, stock: 3 })
      .expect(201);
    productId = create.body.data.id;
    expect(create.body.data.status).toBe('ACTIVE');

    const other = await request(app.getHttpServer())
      .post(`/api/v1/business/${otherBusinessId}/products`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'E2E Cat Toy', categorySlug, price: 5, stock: 10 })
      .expect(201);
    otherProductId = other.body.data.id;

    const publicList = await request(app.getHttpServer())
      .get(`/api/v1/public/products?category=${categorySlug}`)
      .expect(200);
    expect(publicList.body.data.map((p: any) => p.id)).toEqual(
      expect.arrayContaining([productId, otherProductId]),
    );
  });

  it('filters and sorts the public catalog by price', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/products?category=${categorySlug}&sort=price_asc`)
      .expect(200);
    const prices = res.body.data.map((p: any) => Number(p.price));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('a deactivated product disappears from the public catalog', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/business/${businessId}/products/${productId}/deactivate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/products?category=${categorySlug}`)
      .expect(200);
    expect(res.body.data.map((p: any) => p.id)).not.toContain(productId);

    await request(app.getHttpServer())
      .patch(`/api/v1/business/${businessId}/products/${productId}/activate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });

  it('updates stock and reflects it in the low-stock listing', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/business/${businessId}/products/${productId}/stock`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantityChange: -2, reason: 'SALE' })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/business/${businessId}/products?lowStock=true`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.data.some((p: any) => p.id === productId)).toBe(true);
  });

  it('adds an item to the cart and computes the subtotal', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);
    expect(res.body.data.businessId).toBe(businessId);
    expect(res.body.data.subtotal).toBe(20);
  });

  it('refuses to add more than the available stock', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/me/cart/items')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ productId, quantity: 999 })
      .expect(400);
  });

  it('requires replaceCart to add a product from a different business', async () => {
    const conflict = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ productId: otherProductId, quantity: 1 })
      .expect(409);
    expect(conflict.body.error.code).toBe('CART_BELONGS_TO_DIFFERENT_BUSINESS');

    const replaced = await request(app.getHttpServer())
      .post('/api/v1/me/cart/items')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ productId: otherProductId, quantity: 1, replaceCart: true })
      .expect(201);
    expect(replaced.body.data.businessId).toBe(otherBusinessId);
    expect(replaced.body.data.items).toHaveLength(1);
  });

  it('updates item quantity, removes it, then clears the cart', async () => {
    const cart = await request(app.getHttpServer())
      .get('/api/v1/me/cart')
      .set('Authorization', `Bearer ${shopperToken}`)
      .expect(200);
    const itemId = cart.body.data.items[0].id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/me/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ quantity: 3 })
      .expect(200);
    expect(updated.body.data.subtotal).toBe(15);

    await request(app.getHttpServer())
      .delete('/api/v1/me/cart')
      .set('Authorization', `Bearer ${shopperToken}`)
      .expect(200);

    const empty = await request(app.getHttpServer())
      .get('/api/v1/me/cart')
      .set('Authorization', `Bearer ${shopperToken}`)
      .expect(200);
    expect(empty.body.data).toBeNull();
  });
});
