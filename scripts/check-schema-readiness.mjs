#!/usr/bin/env node
/**
 * Ops helper: verify soft-delete cutover columns exist before testing login
 * against a shared preview/production database.
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... node scripts/check-schema-readiness.mjs
 */
import { PrismaClient, Prisma } from "@prisma/client";

const REQUIRED = [
  { table: "Ticket", column: "deleted_at" },
  { table: "Property", column: "deleted_at" },
  { table: "WorkOrder", column: "deleted_at" },
  { table: "Project", column: "deleted_at" },
  { table: "Lease", column: "deleted_at" },
  { table: "AppNotification", column: "deleted_at" },
];

const db = new PrismaClient();

try {
  const tables = [...new Set(REQUIRED.map((item) => item.table))];
  const columns = [...new Set(REQUIRED.map((item) => item.column))];
  const rows = await db.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join(tables)})
      AND column_name IN (${Prisma.join(columns)})
  `;
  const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = REQUIRED.filter((item) => !present.has(`${item.table}.${item.column}`));

  if (missing.length === 0) {
    console.log(JSON.stringify({ ready: true, missing: [], checkedAt: new Date().toISOString() }, null, 2));
    process.exit(0);
  }

  console.error(JSON.stringify({ ready: false, missing, checkedAt: new Date().toISOString() }, null, 2));
  console.error("\nKör Database Release (prisma migrate deploy) för samma commit innan inloggningstest.");
  process.exit(2);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await db.$disconnect();
}
