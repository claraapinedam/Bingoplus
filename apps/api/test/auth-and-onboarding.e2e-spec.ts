import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RoleName } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Critical-path e2e for Phase 1: register -> login -> refresh -> profile; pet CRUD;
 * business onboarding -> admin approve -> activate.
 *
 * Requires a real Postgres reachable at process.env.DATABASE_URL (see docker-compose.yml).
 * Run: `npm run test:e2e --workspace=apps/api` after `docker compose up -d` and
 * `npm run db:migrate`.
 */
describe('BINGO+ API — Phase 1 critical path (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const uniqueSuffix = Date.now();
  const customerEmail = `e2e.customer.${uniqueSuffix}@example-bingoplus.test`;
  const adminEmail = `e2e.admin.${uniqueSuffix}@example-bingoplus.test`;

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
      where: { slug: 'tiendas' },
      update: {},
      create: { name: 'Tiendas', slug: 'tiendas' },
    });
    await prisma.petSpecies.upsert({
      where: { slug: 'dog' },
      update: {},
      create: { name: 'Perro', slug: 'dog' },
    });
  });

  afterAll(async () => {
    // Scoped to this run's own suffix — a broader `contains: 'e2e.'` filter previously raced
    // with other e2e spec files' cleanup when Jest runs suites in parallel workers.
    await prisma.business.deleteMany({ where: { email: `store.${uniqueSuffix}@example-bingoplus.test` } });
    await prisma.user.deleteMany({ where: { email: { contains: `.${uniqueSuffix}@` } } });
    await app.close();
  });

  let accessToken: string;
  let refreshToken: string;
  let businessId: string;

  it('registers a new customer', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: customerEmail, password: 'SuperSecret123!', firstName: 'E2E', lastName: 'Customer' })
      .expect(201);

    expect(res.body.data.user.email).toBe(customerEmail);
    expect(res.body.data.accessToken).toBeDefined();
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('rejects duplicate registration', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: customerEmail, password: 'SuperSecret123!', firstName: 'E2E', lastName: 'Customer' })
      .expect(409);
  });

  it('logs in with the created credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: customerEmail, password: 'SuperSecret123!' })
      .expect(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('refreshes the access token and rotates the refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('rejects an unauthenticated profile request', async () => {
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
  });

  it('returns the authenticated profile', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.email).toBe(customerEmail);
    expect(res.body.data.roles).toContain('CUSTOMER');
  });

  let petId: string;

  it('creates, lists, updates and deletes a pet scoped to the owner', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/me/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Bingo', speciesSlug: 'dog', breed: 'Shih Tzu' })
      .expect(201);
    petId = create.body.data.id;

    const list = await request(app.getHttpServer())
      .get('/api/v1/me/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ weight: 6.5 })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('applies for business affiliation and cannot sell until approved+active', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/me/business')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        tradeName: 'E2E Test Store',
        legalName: 'E2E Test Store S.A.S.',
        taxId: '1790000000001',
        email: `store.${uniqueSuffix}@example-bingoplus.test`,
        phone: '+593999000000',
        categorySlug: 'tiendas',
        addressLine: 'Av. Test 123',
        city: 'Quito',
        sellsProducts: true,
      })
      .expect(201);

    businessId = res.body.data.id;
    expect(res.body.data.status).toBe('PENDING');
  });

  it('a non-admin cannot approve a business', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/businesses/${businessId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(403);
  });

  it('admin approves then activates the business', async () => {
    const passwordHash = await import('argon2').then((a) => a.hash('SuperSecret123!'));
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'E2E',
        lastName: 'Admin',
        isEmailVerified: true,
        roles: { create: { roleId: adminRole.id } },
      },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'SuperSecret123!' })
      .expect(200);
    const adminToken = login.body.data.accessToken;

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/businesses/${businessId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    const activated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/businesses/${businessId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(activated.body.data.status).toBe('ACTIVE');
    await prisma.user.delete({ where: { id: admin.id } }).catch(() => undefined);
  });
});
