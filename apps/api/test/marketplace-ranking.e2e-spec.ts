import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RoleName } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * e2e for the "Tiendas primero, no catálogo global" marketplace ranking: a customer's own pets
 * drive which businesses rank first, computed entirely server-side by BusinessRankingService.
 */
describe('BINGO+ API — Marketplace ranking (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const businessCategorySlug = `e2e-rank-tiendas-${suffix}`;
  const productCategorySlug = `e2e-rank-alimento-${suffix}`;
  const dogSlug = `e2e-dog-${suffix}`;
  const birdSlug = `e2e-bird-${suffix}`;
  const catSlug = `e2e-cat-${suffix}`;

  let customerToken: string;
  let adminToken: string;
  const businessIds: Record<string, string> = {};

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
      create: { name: 'E2E Rank Tiendas', slug: businessCategorySlug },
    });
    await prisma.productCategory.upsert({
      where: { slug: productCategorySlug },
      update: {},
      create: { name: 'E2E Rank Alimento', slug: productCategorySlug },
    });
    await prisma.petSpecies.upsert({ where: { slug: dogSlug }, update: {}, create: { name: 'E2E Perro', slug: dogSlug } });
    await prisma.petSpecies.upsert({ where: { slug: birdSlug }, update: {}, create: { name: 'E2E Ave', slug: birdSlug } });
    await prisma.petSpecies.upsert({ where: { slug: catSlug }, update: {}, create: { name: 'E2E Gato', slug: catSlug } });

    const passwordHash = await import('argon2').then((a) => a.hash('SuperSecret123!'));
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
    await prisma.user.create({
      data: {
        email: `e2e.rankadmin.${suffix}@example-bingoplus.test`,
        passwordHash,
        firstName: 'E2E',
        lastName: 'RankAdmin',
        isEmailVerified: true,
        roles: { create: { roleId: adminRole.id } },
      },
    });
    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `e2e.rankadmin.${suffix}@example-bingoplus.test`, password: 'SuperSecret123!' })
        .expect(200)
    ).body.data.accessToken;

    // Customer with a dog and a bird — the spec's worked example.
    const customerEmail = `e2e.rankshopper.${suffix}@example-bingoplus.test`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: customerEmail, password: 'SuperSecret123!', firstName: 'E2E', lastName: 'Shopper' })
      .expect(201);
    customerToken = registerRes.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/me/pets')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Bingo', speciesSlug: dogSlug })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/me/pets')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Coco', speciesSlug: birdSlug })
      .expect(201);

    // Business owner (separate account) creates and activates 4 stores with different species coverage.
    const ownerEmail = `e2e.rankowner.${suffix}@example-bingoplus.test`;
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: ownerEmail, password: 'SuperSecret123!', firstName: 'E2E', lastName: 'Owner' })
      .expect(201);
    const ownerToken = ownerRes.body.data.accessToken;

    const stores: Array<[string, string[]]> = [
      ['Pet World', [dogSlug, birdSlug, catSlug]], // covers both of the shopper's species + more
      ['Animal House', [dogSlug, catSlug]], // 1 match
      ['Aves y Mas', [birdSlug]], // 1 match
      ['Zoo Market', [catSlug]], // 0 match
    ];

    for (const [tradeName, speciesSlugs] of stores) {
      const applyRes = await request(app.getHttpServer())
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
        })
        .expect(201);
      const businessId = applyRes.body.data.id;
      businessIds[tradeName] = businessId;

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/businesses/${businessId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/businesses/${businessId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/business/${businessId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: `${tradeName} product`,
          categorySlug: productCategorySlug,
          price: 10,
          stock: 5,
          speciesSlugs,
        })
        .expect(201);
    }
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: Object.values(businessIds) } } });
    const e2eSpecies = await prisma.petSpecies.findMany({
      where: { slug: { in: [dogSlug, birdSlug, catSlug] } },
    });
    await prisma.pet.deleteMany({ where: { speciesId: { in: e2eSpecies.map((s) => s.id) } } });
    await prisma.petSpecies.deleteMany({ where: { slug: { in: [dogSlug, birdSlug, catSlug] } } });
    await prisma.productCategory.deleteMany({ where: { slug: productCategorySlug } });
    await prisma.businessCategory.deleteMany({ where: { slug: businessCategorySlug } });
    await prisma.user.deleteMany({ where: { email: { contains: `.${suffix}@` } } });
    await app.close();
  });

  it('ranks businesses by species relevance to the customer\'s own pets, not alphabetically', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/businesses')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const ourStores = res.body.data.filter((b: any) => Object.values(businessIds).includes(b.id));
    const order = ourStores.map((b: any) => b.tradeName);

    expect(order[0]).toBe('Pet World'); // covers both dog + bird
    expect(order[order.length - 1]).toBe('Zoo Market'); // matches neither
    // Animal House and Aves y Mas are both single-species matches — alphabetical tiebreak.
    const middle = order.slice(1, 3);
    expect(middle).toEqual(['Animal House', 'Aves y Mas']);
  });

  it('exposes matched species without leaking the raw name-to-user mapping as fake data', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/businesses')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const petWorld = res.body.data.find((b: any) => b.id === businessIds['Pet World']);
    expect(petWorld.matchedSpecies.sort()).toEqual(['E2E Ave', 'E2E Perro'].sort());
  });

  it('supports anonymous browsing filtered by an explicit species, without a user context', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/businesses?species=${catSlug}`)
      .expect(200);
    const names = res.body.data
      .filter((b: any) => Object.values(businessIds).includes(b.id))
      .map((b: any) => b.tradeName);
    expect(names).toEqual(expect.arrayContaining(['Pet World', 'Animal House', 'Zoo Market']));
    expect(names).not.toContain('Aves y Mas');
  });

  it('admin can read and update the ranking weights, rejecting a set that does not sum to 1', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/v1/admin/settings/ranking-weights')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(before.body.data.speciesMatch).toBe(0.45);

    await request(app.getHttpServer())
      .patch('/api/v1/admin/settings/ranking-weights')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ speciesMatch: 0.5, distance: 0.5, availability: 0, rating: 0, delivery: 0.5 })
      .expect(400);

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/admin/settings/ranking-weights')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ speciesMatch: 0.6, distance: 0.2, availability: 0.1, rating: 0.05, delivery: 0.05 })
      .expect(200);
    expect(updated.body.data.speciesMatch).toBe(0.6);

    // restore defaults so other tests/manual runs aren't affected
    await request(app.getHttpServer())
      .patch('/api/v1/admin/settings/ranking-weights')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ speciesMatch: 0.45, distance: 0.25, availability: 0.1, rating: 0.1, delivery: 0.1 })
      .expect(200);
  });
});
