#!/usr/bin/env node
/**
 * Ops helper: verify soft-delete cutover columns exist before testing login
 * against a shared preview/production database.
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... node scripts/check-schema-readiness.mjs
 */
import { PrismaClient, Prisma } from "@prisma/client";

const REQUIRED_COLUMNS = [
  { table: "Ticket", column: "deleted_at" },
  { table: "Property", column: "deleted_at" },
  { table: "WorkOrder", column: "deleted_at" },
  { table: "Project", column: "deleted_at" },
  { table: "Lease", column: "deleted_at" },
  { table: "LeaseHolder", column: "deleted_at" },
  { table: "AppNotification", column: "deleted_at" },
  { table: "OperationalDocument", column: "deleted_at" },
  { table: "TicketOperation", column: "deleted_at" },
];

const REQUIRED_TABLES = [
  "InspectionChecklistTemplate",
  "InspectionRound",
  "OperationalDocument",
  "MaintenancePlan",
  "ComponentLifecycleEvent",
  "ComponentCostEntry",
];

const db = new PrismaClient();

try {
  const tables = [...new Set(REQUIRED_COLUMNS.map((item) => item.table))];
  const columns = [...new Set(REQUIRED_COLUMNS.map((item) => item.column))];
  const [columnRows, tableRows] = await Promise.all([
    db.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(tables)})
        AND column_name IN (${Prisma.join(columns)})
    `,
    db.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
    `,
  ]);
  const presentColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  const presentTables = new Set(tableRows.map((row) => row.table_name));
  const missing = [
    ...REQUIRED_COLUMNS.filter((item) => !presentColumns.has(`${item.table}.${item.column}`)),
    ...REQUIRED_TABLES.filter((table) => !presentTables.has(table)).map((table) => ({ table, column: "*" })),
  ];

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
