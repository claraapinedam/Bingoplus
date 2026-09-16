/**
 * Development seed data. Every name/email/phone below is fictitious (per project rule §60 —
 * no real people's data). Run with `npm run prisma:seed --workspace=apps/api`.
 */
import {
  BusinessCapabilityType,
  BusinessMembershipStatus,
  BusinessStatus,
  BusinessUserRole,
  CouponDiscountType,
  PrismaClient,
  RoleName,
  ServiceType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'BingoPlus2024!';

/**
 * `seedBusinesses`/`seedProducts`/`seedPets`/`seedPetFriendlyPlaces`/membership+coupon seeding
 * use plain `.create()` (no natural unique key to upsert on), so re-running this script against
 * a non-empty database would otherwise duplicate everything on each run. Clearing them first
 * keeps the seed idempotent — safe because this table set is exclusively the fictitious dev data
 * this script itself owns. Order matters: AdminCouponRedemption references BusinessMembership,
 * and CouponRedemption references Business directly (not only via its coupon), neither with a
 * cascade — both must go before Business (whose delete does cascade BusinessCoupon/Membership).
 */
async function resetDevData() {
  await prisma.adminCouponRedemption.deleteMany({});
  await prisma.adminCoupon.deleteMany({});
  await prisma.couponRedemption.deleteMany({});
  await prisma.cart.deleteMany({});
  await prisma.business.deleteMany({});
  await prisma.membershipPlan.deleteMany({});
  await prisma.pet.deleteMany({});
  await prisma.petFriendlyPlace.deleteMany({});
}

async function seedRolesAndPermissions() {
  const roles = Object.values(RoleName);
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const permissions: Array<[string, string]> = [
    ['businesses', 'approve'],
    ['businesses', 'suspend'],
    ['businesses', 'capabilities'],
    ['users', 'suspend'],
    ['orders', 'refund'],
    ['settings', 'write'],
    ['memberships', 'manage'],
    ['coupons', 'manage'],
  ];
  for (const [resource, action] of permissions) {
    await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action },
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
  const allPermissions = await prisma.permission.findMany();
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    });
  }
}

async function seedCategories() {
  const businessCategories = [
    { name: 'Tiendas', slug: 'tiendas', icon: 'shopping-bag' },
    { name: 'Veterinarios', slug: 'veterinarios', icon: 'stethoscope' },
    { name: 'Guarderías', slug: 'guarderias', icon: 'home' },
    { name: 'Hospedajes', slug: 'hospedajes', icon: 'bed' },
    { name: 'Grooming', slug: 'grooming', icon: 'scissors' },
    { name: 'Paseadores', slug: 'paseadores', icon: 'footprints' },
    { name: 'Pet Friendly', slug: 'pet-friendly', icon: 'paw' },
    { name: 'Delivery', slug: 'delivery', icon: 'truck' },
  ];
  for (const c of businessCategories) {
    await prisma.businessCategory.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  const productCategories = [
    { name: 'Alimento', slug: 'alimento' },
    { name: 'Snacks', slug: 'snacks' },
    { name: 'Juguetes', slug: 'juguetes' },
    { name: 'Accesorios', slug: 'accesorios' },
    { name: 'Higiene', slug: 'higiene' },
    { name: 'Camas', slug: 'camas' },
    { name: 'Transporte', slug: 'transporte' },
    { name: 'Farmacia veterinaria', slug: 'farmacia-veterinaria' },
    { name: 'Otros', slug: 'otros' },
  ];
  for (const c of productCategories) {
    await prisma.productCategory.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  const petFriendlyCategories = [
    { name: 'Restaurantes', slug: 'restaurantes' },
    { name: 'Cafeterías', slug: 'cafeterias' },
    { name: 'Parques', slug: 'parques' },
    { name: 'Hoteles', slug: 'hoteles' },
    { name: 'Centros comerciales', slug: 'centros-comerciales' },
    { name: 'Tiendas', slug: 'tiendas-pet-friendly' },
    { name: 'Otros', slug: 'otros-pet-friendly' },
  ];
  for (const c of petFriendlyCategories) {
    await prisma.petFriendlyCategory.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
}

async function seedPlatformSettings() {
  const settings: Array<[string, unknown, string]> = [
    ['default_commission_rate', 0.15, 'Default marketplace commission applied to a new business unless overridden'],
    ['default_service_fee_rate', 0.05, 'Service fee charged to the customer at checkout'],
    ['delivery_fee_base', 1.5, 'Base delivery fee (currency units) before distance-based pricing'],
    ['delivery_fee_per_km', 0.4, 'Additional delivery fee per kilometer'],
  ];
  for (const [key, value, description] of settings) {
    await prisma.platformSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as any, description },
    });
  }
}

/** Only seeds a default row if none exists yet — MarketplaceRankingConfig is append-only history, not an upsert-by-key table. */
async function seedMarketplaceRankingConfig() {
  const existing = await prisma.marketplaceRankingConfig.findFirst();
  if (existing) return;
  await prisma.marketplaceRankingConfig.create({
    data: {
      speciesMatchWeight: 0.45,
      distanceWeight: 0.25,
      availabilityWeight: 0.1,
      ratingWeight: 0.1,
      deliveryWeight: 0.1,
    },
  });
}

async function seedPetSpecies() {
  const species = [
    { name: 'Perro', slug: 'dog', icon: 'dog' },
    { name: 'Gato', slug: 'cat', icon: 'cat' },
    { name: 'Ave', slug: 'bird', icon: 'bird' },
    { name: 'Pez', slug: 'fish', icon: 'fish' },
    { name: 'Conejo', slug: 'rabbit', icon: 'rabbit' },
    { name: 'Roedor', slug: 'rodent', icon: 'rodent' },
    { name: 'Reptil', slug: 'reptile', icon: 'reptile' },
    { name: 'Otro', slug: 'other', icon: 'paw' },
  ];
  for (const s of species) {
    await prisma.petSpecies.upsert({ where: { slug: s.slug }, update: {}, create: s });
  }
}

async function seedUsers() {
  const passwordHash = await argon2.hash(DEV_PASSWORD);
  const customerRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.CUSTOMER } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.SUPER_ADMIN },
  });

  const fakeCustomers = [
    ['maria.fake', 'María', 'Fernández'],
    ['juan.fake', 'Juan', 'Torres'],
    ['ana.fake', 'Ana', 'Suárez'],
    ['carlos.fake', 'Carlos', 'Vega'],
    ['lucia.fake', 'Lucía', 'Pazmiño'],
    ['diego.fake', 'Diego', 'Salazar'],
    ['valentina.fake', 'Valentina', 'Rosales'],
    ['pedro.fake', 'Pedro', 'Cevallos'],
  ];

  const users = [];
  for (const [handle, firstName, lastName] of fakeCustomers) {
    const user = await prisma.user.upsert({
      where: { email: `${handle}@example-bingoplus.test` },
      update: {},
      create: {
        email: `${handle}@example-bingoplus.test`,
        passwordHash,
        firstName,
        lastName,
        isEmailVerified: true,
        roles: { create: { roleId: customerRole.id } },
      },
    });
    users.push(user);
  }

  const admin = await prisma.user.upsert({
    where: { email: 'admin.fake@example-bingoplus.test' },
    update: {},
    create: {
      email: 'admin.fake@example-bingoplus.test',
      passwordHash,
      firstName: 'Admin',
      lastName: 'BingoPlus',
      isEmailVerified: true,
      roles: { create: { roleId: adminRole.id } },
    },
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin.fake@example-bingoplus.test' },
    update: {},
    create: {
      email: 'superadmin.fake@example-bingoplus.test',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      isEmailVerified: true,
      roles: { create: { roleId: superAdminRole.id } },
    },
  });

  return { customers: users, admin, superAdmin };
}

async function seedPets(customers: { id: string }[]) {
  const petSpecies = await prisma.petSpecies.findMany();
  const bySlug = (slug: string) => petSpecies.find((s) => s.slug === slug)!.id;

  const petNames = [
    ['Bingo', 'dog', 'Shih Tzu'],
    ['Toby', 'dog', 'Labrador'],
    ['Michi', 'cat', 'Común europeo'],
    ['Luna', 'dog', 'Poodle'],
    ['Simón', 'cat', 'Siamés'],
    ['Rocky', 'dog', 'Bulldog Francés'],
    ['Nube', 'rabbit', 'Enano'],
    ['Max', 'dog', 'Schnauzer'],
    ['Kiwi', 'bird', 'Periquito'],
    ['Coco', 'dog', 'Chihuahua'],
  ] as const;

  const pets = [];
  for (let i = 0; i < petNames.length; i++) {
    const [name, speciesSlug, breed] = petNames[i];
    const owner = customers[i % customers.length];
    const pet = await prisma.pet.create({
      data: {
        ownerId: owner.id,
        name,
        speciesId: bySlug(speciesSlug),
        breed,
        sex: i % 2 === 0 ? 'MALE' : 'FEMALE',
        weight: 3 + i,
      },
    });
    pets.push(pet);
  }
  return pets;
}

interface BusinessSeed {
  tradeName: string;
  categorySlug: string;
  status: BusinessStatus;
  sellsProducts: boolean;
  hasServices: boolean;
  hasCoupons: boolean;
}

/**
 * `sellsProducts`/`hasServices` are chosen to demonstrate all three shapes RULE 6/7/8 describe:
 * Marketplace-only (Tiendas), Directory-only (Hospedajes/Grooming/Paseadores), and Hybrid
 * (VetCare Quito, Guardería Huellitas — one Business, both capabilities) rather than one
 * Business per shape.
 */
const BUSINESS_SEEDS: BusinessSeed[] = [
  { tradeName: 'PetShop Patitas Felices', categorySlug: 'tiendas', status: BusinessStatus.ACTIVE, sellsProducts: true, hasServices: false, hasCoupons: true },
  { tradeName: 'VetCare Quito', categorySlug: 'veterinarios', status: BusinessStatus.ACTIVE, sellsProducts: true, hasServices: true, hasCoupons: true },
  { tradeName: 'Guardería Huellitas', categorySlug: 'guarderias', status: BusinessStatus.ACTIVE, sellsProducts: true, hasServices: true, hasCoupons: false },
  { tradeName: 'Hotel Canino Bingo Suites', categorySlug: 'hospedajes', status: BusinessStatus.ACTIVE, sellsProducts: false, hasServices: true, hasCoupons: false },
  { tradeName: 'Grooming Style Pet', categorySlug: 'grooming', status: BusinessStatus.ACTIVE, sellsProducts: false, hasServices: true, hasCoupons: false },
  { tradeName: 'Paseadores Norte', categorySlug: 'paseadores', status: BusinessStatus.APPROVED, sellsProducts: false, hasServices: true, hasCoupons: false },
  { tradeName: 'Tienda Mundo Mascota', categorySlug: 'tiendas', status: BusinessStatus.ACTIVE, sellsProducts: true, hasServices: false, hasCoupons: false },
  { tradeName: 'Clínica Veterinaria Sur', categorySlug: 'veterinarios', status: BusinessStatus.PENDING, sellsProducts: true, hasServices: true, hasCoupons: false },
  { tradeName: 'Spa Canino Deluxe', categorySlug: 'grooming', status: BusinessStatus.UNDER_REVIEW, sellsProducts: false, hasServices: true, hasCoupons: false },
  { tradeName: 'PetMarket Express', categorySlug: 'tiendas', status: BusinessStatus.ACTIVE, sellsProducts: true, hasServices: false, hasCoupons: false },
];

async function grantCapabilities(businessId: string, seed: BusinessSeed, deliveryEnabled: boolean) {
  const rows: { capability: BusinessCapabilityType; enabled: boolean }[] = [
    { capability: BusinessCapabilityType.DIRECTORY_LISTING, enabled: true },
    { capability: BusinessCapabilityType.SELLS_PRODUCTS, enabled: seed.sellsProducts },
  ];
  if (seed.sellsProducts) {
    rows.push({ capability: BusinessCapabilityType.PICKUP, enabled: true });
    rows.push({ capability: BusinessCapabilityType.DELIVERY, enabled: deliveryEnabled });
  }
  if (seed.hasServices) {
    rows.push({ capability: BusinessCapabilityType.SERVICES, enabled: true });
    rows.push({ capability: BusinessCapabilityType.BOOKINGS, enabled: true });
  }
  if (seed.hasCoupons) {
    rows.push({ capability: BusinessCapabilityType.COUPONS, enabled: true });
  }
  await prisma.businessCapability.createMany({ data: rows.map((r) => ({ businessId, ...r })) });
}

async function seedBusinesses(owners: { id: string }[]) {
  const categories = await prisma.businessCategory.findMany();
  const byCategory = (slug: string) => categories.find((c) => c.slug === slug)!;

  // Realistic-enough hours so `calculateAvailabilityScore` has something to compute against —
  // half the businesses get real hours, half stay `null` to also exercise the "unknown" branch.
  const dailyHours = { open: '09:00', close: '19:00' };
  const fullWeekHours = {
    mon: dailyHours,
    tue: dailyHours,
    wed: dailyHours,
    thu: dailyHours,
    fri: dailyHours,
    sat: dailyHours,
  };

  const businesses: Array<Awaited<ReturnType<typeof prisma.business.create>> & { seed: BusinessSeed }> = [];
  for (let i = 0; i < BUSINESS_SEEDS.length; i++) {
    const seed = BUSINESS_SEEDS[i];
    const owner = owners[i % owners.length];
    // Deterministic per index (not Math.random()) so re-running seed against the same reset DB
    // produces the same DELIVERY grant — and the fee/time below are only ever set to match it.
    const deliveryEnabled = seed.sellsProducts && i % 3 !== 0;
    const business = await prisma.business.create({
      data: {
        ownerId: owner.id,
        categoryId: byCategory(seed.categorySlug).id,
        tradeName: seed.tradeName,
        legalName: `${seed.tradeName} S.A.S. (ficticio)`,
        taxId: `179000000${i}001`,
        email: `contacto${i}@example-bingoplus.test`,
        phone: `+593999000${100 + i}`,
        description: `${seed.tradeName} — negocio de ejemplo generado para desarrollo.`,
        addressLine: `Av. Ficticia ${100 + i}`,
        city: 'Quito',
        latitude: -0.1807 + i * 0.004,
        longitude: -78.4678 + i * 0.004,
        openingHours: i % 2 === 0 ? fullWeekHours : undefined,
        status: seed.status,
        ratingAvg: 3.5 + (i % 5) * 0.3,
        reviewCount: 5 + i,
        deliveryFeeUsd: deliveryEnabled ? 1 + (i % 4) * 0.25 : undefined,
        deliveryEstimateMinutes: deliveryEnabled ? 20 + (i % 3) * 5 : undefined,
        businessUsers: { create: { userId: owner.id, role: BusinessUserRole.OWNER } },
      },
    });
    await grantCapabilities(business.id, seed, deliveryEnabled);
    if (seed.status !== BusinessStatus.PENDING) {
      await prisma.commission.create({
        data: { businessId: business.id, rate: 0.15 },
      });
    }
    businesses.push({ ...business, seed });
  }
  return businesses;
}

async function seedProducts(businesses: { id: string; seed: BusinessSeed }[]) {
  const productCategories = await prisma.productCategory.findMany();
  const petSpecies = await prisma.petSpecies.findMany();
  const speciesIds = (slugs: string[]) =>
    slugs.map((slug) => petSpecies.find((s) => s.slug === slug)!.id);

  // Each product names the species it's recommended for — this is the signal
  // BusinessRankingService reads to rank businesses by relevance to a customer's pets.
  const productsByCategory: Record<string, Array<[string, string[]]>> = {
    alimento: [
      ['Alimento Premium Perro Adulto', ['dog']],
      ['Alimento Gato Interior', ['cat']],
      ['Croquetas Cachorro', ['dog']],
    ],
    snacks: [
      ['Snacks Dentales', ['dog', 'cat']],
      ['Galletas de Hígado', ['dog']],
      ['Premios de Entrenamiento', ['dog']],
    ],
    juguetes: [
      ['Pelota Interactiva', ['dog']],
      ['Cuerda de Nudos', ['dog']],
      ['Ratón de Juguete', ['cat']],
    ],
    accesorios: [
      ['Collar Ajustable', ['dog', 'cat']],
      ['Correa Retráctil', ['dog']],
      ['Placa de Identificación', ['dog', 'cat']],
    ],
    higiene: [
      ['Shampoo Hipoalergénico', ['dog', 'cat']],
      ['Toallitas Húmedas', ['dog', 'cat', 'rabbit']],
      ['Cepillo Dental', ['dog', 'cat']],
    ],
    camas: [
      ['Cama Ortopédica M', ['dog', 'cat']],
      ['Cojín Redondo L', ['dog', 'cat']],
      ['Colchoneta Impermeable', ['dog']],
    ],
    transporte: [
      ['Transportadora Mediana', ['dog', 'cat', 'rabbit']],
      ['Mochila de Transporte', ['cat', 'bird', 'rabbit']],
      ['Arnés para Auto', ['dog']],
    ],
    'farmacia-veterinaria': [
      ['Antipulgas Tópico', ['dog', 'cat']],
      ['Suplemento Articular', ['dog', 'cat']],
      ['Vitaminas Multiuso', ['dog', 'cat', 'bird', 'rabbit', 'reptile', 'fish', 'rodent']],
    ],
    otros: [
      ['Comedero Automático', ['dog', 'cat']],
      ['Fuente de Agua', ['dog', 'cat', 'bird']],
      ['Rascador para Gatos', ['cat']],
    ],
  };

  const businessesWithProducts = businesses.filter((b) => b.seed.sellsProducts);

  let created = 0;
  outer: for (const business of businessesWithProducts) {
    for (const category of productCategories) {
      const entries = productsByCategory[category.slug] ?? [];
      for (const [name, speciesSlugs] of entries) {
        if (created >= 50) break outer;
        created += 1;
        await prisma.product.create({
          data: {
            businessId: business.id,
            categoryId: category.id,
            name: `${name} (demo)`,
            description: `${name} — producto de ejemplo generado para desarrollo.`,
            price: 5 + ((created * 3) % 40),
            stock: 10 + (created % 20),
            images: [],
            species: {
              create: speciesIds(speciesSlugs).map((speciesId) => ({ speciesId })),
            },
          },
        });
      }
    }
  }
}

async function seedRiders(count: number) {
  const passwordHash = await argon2.hash(DEV_PASSWORD);
  const riderRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.RIDER } });
  const names = [
    ['Andrés', 'Ríos'],
    ['Paola', 'Guerrero'],
    ['Esteban', 'Mora'],
    ['Camila', 'Andrade'],
    ['Fernando', 'Chávez'],
  ];

  for (let i = 0; i < count; i++) {
    const [firstName, lastName] = names[i];
    const user = await prisma.user.upsert({
      where: { email: `rider${i}.fake@example-bingoplus.test` },
      update: {},
      create: {
        email: `rider${i}.fake@example-bingoplus.test`,
        passwordHash,
        firstName,
        lastName,
        isEmailVerified: true,
        roles: { create: { roleId: riderRole.id } },
      },
    });

    await prisma.rider.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        status: i === 0 ? 'PENDING_APPROVAL' : 'APPROVED',
        city: 'Quito',
        vehicles: { create: { type: i % 2 === 0 ? 'MOTORCYCLE' : 'BIKE' } },
      },
    });
  }
}

async function seedServices(businesses: { id: string; seed: BusinessSeed }[]) {
  const withServices = businesses.filter((b) => b.seed.hasServices);
  const serviceTemplates: Array<[ServiceType, string, number, number]> = [
    ['VETERINARY', 'Consulta general', 20, 30],
    ['VETERINARY', 'Vacunación', 15, 20],
    ['GROOMING', 'Baño y corte', 18, 60],
    ['GROOMING', 'Corte de uñas', 8, 15],
    ['DAYCARE', 'Guardería medio día', 12, 240],
    ['BOARDING', 'Hospedaje noche', 25, 1440],
    ['DOG_WALKING', 'Paseo 30 minutos', 10, 30],
    ['DOG_WALKING', 'Paseo 60 minutos', 15, 60],
    ['GROOMING', 'Grooming completo', 30, 90],
    ['VETERINARY', 'Desparasitación', 12, 15],
  ];

  for (let i = 0; i < serviceTemplates.length; i++) {
    const [type, name, price, durationMinutes] = serviceTemplates[i];
    const business = withServices[i % withServices.length];
    await prisma.service.create({
      data: { businessId: business.id, type, name, price, durationMinutes },
    });
  }
}

async function seedPetFriendlyPlaces() {
  const categories = await prisma.petFriendlyCategory.findMany();
  const places = [
    ['Café Huellas', 'cafeterias'],
    ['Parque Bicentenario Pet Zone', 'parques'],
    ['Restaurante El Jardín Pet Friendly', 'restaurantes'],
    ['Hotel Quito Pet Suites', 'hoteles'],
    ['Mall Amigo Peludo', 'centros-comerciales'],
    ['Parque La Carolina Área Canina', 'parques'],
    ['Café Bingo Corner', 'cafeterias'],
    ['Restaurante Terraza Mascotas', 'restaurantes'],
    ['Tienda Pet Lovers', 'tiendas-pet-friendly'],
    ['Centro Recreativo Amigos Peludos', 'otros-pet-friendly'],
  ] as const;

  for (let i = 0; i < places.length; i++) {
    const [name, categorySlug] = places[i];
    const category = categories.find((c) => c.slug === categorySlug)!;
    await prisma.petFriendlyPlace.create({
      data: {
        name,
        categoryId: category.id,
        description: `${name} — lugar de ejemplo generado para desarrollo.`,
        address: `Calle Ficticia ${200 + i}, Quito`,
        latitude: -0.18 + i * 0.003,
        longitude: -78.47 + i * 0.003,
        verified: i % 2 === 0,
        amenities: ['agua para mascotas', 'área exterior'],
      },
    });
  }
}

/**
 * Membership → Subscription → Invoice, deliberately separate from Marketplace Order billing
 * (RULE 17). A few businesses are TRIAL (freshly onboarded), a few ACTIVE with a paid period on
 * record, and one PAST_DUE, to exercise every BusinessMembershipStatus the code branches on.
 */
async function seedMemberships(businesses: { id: string }[]) {
  const starter = await prisma.membershipPlan.create({
    data: {
      name: 'Plan Starter',
      description: 'Listado en el Directory de BINGO+, gestión de cupones y recepción de calificaciones.',
      price: 25,
      currency: 'USD',
      billingFrequency: 'MONTHLY',
      trialDays: 30,
      benefits: { coupons: true, reviews: true, bookings: false, featured: false, prioritySupport: false },
      applicableCategories: [],
      isDefault: true,
    },
  });
  const pro = await prisma.membershipPlan.create({
    data: {
      name: 'Plan Pro',
      description: 'Todo lo de Starter, más gestión de reservas, destacado en búsquedas y soporte prioritario.',
      price: 35,
      currency: 'USD',
      billingFrequency: 'MONTHLY',
      trialDays: 30,
      benefits: { coupons: true, reviews: true, bookings: true, featured: true, prioritySupport: true },
      applicableCategories: [],
    },
  });

  const now = new Date();
  const statuses: BusinessMembershipStatus[] = [
    BusinessMembershipStatus.ACTIVE,
    BusinessMembershipStatus.ACTIVE,
    BusinessMembershipStatus.ACTIVE,
    BusinessMembershipStatus.TRIAL,
    BusinessMembershipStatus.TRIAL,
    BusinessMembershipStatus.PAST_DUE,
    BusinessMembershipStatus.TRIAL,
    BusinessMembershipStatus.TRIAL,
    BusinessMembershipStatus.TRIAL,
    BusinessMembershipStatus.ACTIVE,
  ];

  for (let i = 0; i < businesses.length; i++) {
    const plan = i % 3 === 0 ? pro : starter;
    const status = statuses[i] ?? BusinessMembershipStatus.TRIAL;
    const periodStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000);

    const membership = await prisma.businessMembership.create({
      data: {
        businessId: businesses[i].id,
        planId: plan.id,
        status,
        trialEndsAt: status === BusinessMembershipStatus.TRIAL || status === BusinessMembershipStatus.PAST_DUE
          ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
          : null,
        currentPeriodStart: status === BusinessMembershipStatus.ACTIVE ? periodStart : null,
        currentPeriodEnd: status === BusinessMembershipStatus.ACTIVE ? periodEnd : null,
      },
    });

    if (status === BusinessMembershipStatus.ACTIVE) {
      const subscription = await prisma.subscription.create({
        data: {
          membershipId: membership.id,
          periodStart,
          periodEnd,
          amount: plan.price,
          currency: plan.currency,
          status: 'ACTIVE',
        },
      });
      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          amount: plan.price,
          currency: plan.currency,
          status: 'PAID',
          dueDate: periodStart,
          paidAt: periodStart,
        },
      });
    }
  }

  return { starter, pro };
}

/**
 * BusinessCoupon (presential redemption — RULE 14/15): never applied at Marketplace checkout.
 * Seeds a couple of coupons on businesses with the COUPONS capability, plus one redemption to
 * demonstrate the CouponRedemption trail feeding usagePerCustomer/usageLimit validation.
 */
async function seedBusinessCoupons(
  businesses: { id: string; tradeName: string; seed: BusinessSeed }[],
  customers: { id: string }[],
) {
  const withCoupons = businesses.filter((b) => b.seed.hasCoupons);
  const now = new Date();
  const start = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const expiration = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000);

  for (const business of withCoupons) {
    const coupon = await prisma.businessCoupon.create({
      data: {
        businessId: business.id,
        code: `BIENVENIDA-${business.tradeName.slice(0, 3).toUpperCase()}`,
        title: '15% de descuento — primera visita',
        description: `Válido presencialmente en ${business.tradeName}.`,
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 15,
        minimumPurchase: 10,
        maximumDiscount: 20,
        startDate: start,
        expirationDate: expiration,
        usageLimit: 100,
        usagePerCustomer: 1,
        termsAndConditions: 'Un uso por cliente. No acumulable con otras promociones.',
        status: 'ACTIVE',
      },
    });

    // One demo redemption on the first business only, to leave the second one fully unredeemed
    // (useful for exercising the "not yet used" path too).
    if (business === withCoupons[0]) {
      await prisma.couponRedemption.create({
        data: {
          couponId: coupon.id,
          businessId: business.id,
          customerId: customers[0].id,
          discountAmount: 3,
          purchaseAmount: 20,
          currency: 'USD',
        },
      });
    }
  }
}

/** AdminCoupon (membership billing — RULE 16/17), separate from BusinessCoupon. Definitions only; no redemption is faked here. */
async function seedAdminCoupons() {
  const now = new Date();
  await prisma.adminCoupon.create({
    data: {
      code: 'BINGO-LANZAMIENTO20',
      name: '20% de descuento de lanzamiento',
      description: 'Para negocios que se unen durante el lanzamiento de BINGO+.',
      discountType: 'PERCENTAGE_DISCOUNT',
      discountValue: 20,
      startDate: now,
      expirationDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
      usageLimit: 50,
      usagePerBusiness: 1,
      applicablePlans: [],
      status: 'ACTIVE',
      termsAndConditions: 'Aplica al primer período de facturación.',
    },
  });
  await prisma.adminCoupon.create({
    data: {
      code: 'BINGO-2MESESGRATIS',
      name: '2 meses gratis',
      description: 'Cortesía de BINGO+ para negocios seleccionados.',
      discountType: 'FREE_MONTHS',
      freeMonths: 2,
      startDate: now,
      expirationDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      usageLimit: 10,
      usagePerBusiness: 1,
      applicablePlans: [],
      status: 'ACTIVE',
    },
  });
}

async function main() {
  console.log('Seeding BINGO+ development data (all fictitious)...');
  await resetDevData();
  await seedRolesAndPermissions();
  await seedCategories();
  await seedPetSpecies();
  await seedPlatformSettings();
  await seedMarketplaceRankingConfig();
  const { customers } = await seedUsers();
  await seedPets(customers);
  const businesses = await seedBusinesses(customers);
  await seedProducts(businesses);
  await seedRiders(5);
  await seedServices(businesses);
  await seedPetFriendlyPlaces();
  await seedMemberships(businesses);
  await seedBusinessCoupons(businesses, customers);
  await seedAdminCoupons();
  console.log('Seed complete.');
  console.log(`Dev login password for every seeded user: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
