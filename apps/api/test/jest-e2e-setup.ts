import * as dotenv from 'dotenv';
import * as path from 'path';

// Runs before any spec file or Nest module code — overrides process.env so PrismaService
// connects to the isolated test database (apps/api/.env.test), never the dev database that the
// running API/Admin/Customer apps actually read from.
//
// CI already provides its own ephemeral, isolated Postgres service and sets DATABASE_URL at the
// job level (.github/workflows/ci.yml) — skip the override there so this doesn't fight it.
if (!process.env.CI) {
  dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });
}
