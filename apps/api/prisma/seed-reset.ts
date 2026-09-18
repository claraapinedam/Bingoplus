/**
 * Clean-slate reset for testing every flow from scratch (across devices, not just one dev
 * machine) — run `npx prisma migrate reset --force --skip-seed` first to wipe the database
 * entirely, then this script (`npm run prisma:reset --workspace=apps/api`) to seed back only
 * what the platform needs to function (roles/permissions, category/species pickers, default
 * settings) plus a single SUPER_ADMIN account. No fake businesses/riders/customers/orders —
 * those get created for real through the actual apply/checkout/booking flows instead.
 */
import { PrismaClient, RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedRolesAndPermissions, seedCategories, seedPlatformSettings, seedMarketplaceRankingConfig, seedPetSpecies } from './seed-helpers';

const prisma = new PrismaClient();

const SUPERADMIN_EMAIL = 'superadmin.fake@example-bingoplus.test';
const SUPERADMIN_PASSWORD = 'BingoPlus2024!';

async function seedSuperAdmin() {
  const passwordHash = await argon2.hash(SUPERADMIN_PASSWORD);
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SUPER_ADMIN } });
  return prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    update: {},
    create: {
      email: SUPERADMIN_EMAIL,
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      isEmailVerified: true,
      roles: { create: { roleId: superAdminRole.id } },
    },
  });
}

async function main() {
  console.log('Seeding clean baseline (roles, categories, config) + superadmin only...');
  await seedRolesAndPermissions(prisma);
  await seedCategories(prisma);
  await seedPetSpecies(prisma);
  await seedPlatformSettings(prisma);
  await seedMarketplaceRankingConfig(prisma);
  await seedSuperAdmin();
  console.log('Clean reset complete — no test businesses/riders/customers/orders.');
  console.log(`Superadmin login: ${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
