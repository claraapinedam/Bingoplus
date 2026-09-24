/**
 * Baseline platform data every environment needs to function at all — roles/permissions,
 * category/species pickers, and default settings — as opposed to the fictitious dev-only test
 * data (businesses, riders, customers, orders, ...) in seed.ts. Shared by seed.ts (full dev
 * dataset) and seed-reset.ts (clean slate + superadmin only) so the two never drift apart.
 */
import { PrismaClient, RoleName } from '@prisma/client';

export async function seedRolesAndPermissions(prisma: PrismaClient) {
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

export async function seedCategories(prisma: PrismaClient) {
  const businessCategories = [
    { name: 'Tiendas', slug: 'tiendas', icon: 'shopping-bag' },
    { name: 'Veterinarios', slug: 'veterinarios', icon: 'stethoscope' },
    { name: 'Guarderías', slug: 'guarderias', icon: 'home' },
    { name: 'Hospedajes', slug: 'hospedajes', icon: 'bed' },
    { name: 'Grooming', slug: 'grooming', icon: 'scissors' },
    { name: 'Paseadores', slug: 'paseadores', icon: 'footprints' },
    { name: 'Adiestradores', slug: 'adiestradores', icon: 'graduation-cap' },
    { name: 'Otros Pet services', slug: 'otros-pet-services', icon: 'sparkles' },
  ];
  for (const c of businessCategories) {
    await prisma.businessCategory.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  // "Delivery" used to be its own category alongside "Tiendas" — redundant, since fulfillment
  // (pickup/delivery) is already a per-business toggle in Settings. Retired from new applications
  // (see BusinessApplyForm's PRODUCT_CATEGORY_SLUGS), but never deleted here — a business that
  // already has it stays exactly as it is (no forced migration).
  // "Pet Friendly" used to be a business/membership category here — it's now the community-
  // submitted PetFriendlyPlace directory instead (see seedPetFriendlyPlaces), never a Business.
  // No seeded Business ever used this slug, so removing the stale row is safe in every environment.
  await prisma.businessCategory.deleteMany({ where: { slug: 'pet-friendly' } });

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
}

export async function seedPlatformSettings(prisma: PrismaClient) {
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
export async function seedMarketplaceRankingConfig(prisma: PrismaClient) {
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

export async function seedPetSpecies(prisma: PrismaClient) {
  const species = [
    { name: 'Perro', slug: 'dog', icon: '🐶' },
    { name: 'Gato', slug: 'cat', icon: '🐱' },
    { name: 'Ave', slug: 'bird', icon: '🐦' },
    { name: 'Pez', slug: 'fish', icon: '🐠' },
    { name: 'Conejo', slug: 'rabbit', icon: '🐰' },
    { name: 'Roedor', slug: 'rodent', icon: '🐹' },
    { name: 'Reptil', slug: 'reptile', icon: '🦎' },
    { name: 'Otro', slug: 'other', icon: '🐾' },
  ];
  for (const s of species) {
    await prisma.petSpecies.upsert({ where: { slug: s.slug }, update: {}, create: s });
  }
}
