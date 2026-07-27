#!/usr/bin/env node
/**
 * Production cron smoke for every job scheduled in vercel.json.
 *
 * Usage:
 *   BASE_URL=https://www.revalta.se CRON_SECRET=... node scripts/smoke-cron.mjs
 *
 * Optional:
 *   CRON_TIMEOUT_MS=45000
 *   CRON_ALLOW_SKIP=1   # treat 204/empty successful skip as pass (default on)
 */
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || "";
const timeoutMs = Number(process.env.CRON_TIMEOUT_MS || 45_000);

if (!secret) {
  console.error("FAIL: CRON_SECRET is required");
  process.exit(1);
}

/** Keep in sync with vercel.json `crons`. */
const jobs = [
  { path: "/api/cron/component-service-reminders", label: "component-service-reminders" },
  { path: "/api/cron/preventive-maintenance", label: "preventive-maintenance" },
  { path: "/api/cron/service-assignment-escalations", label: "service-assignment-escalations" },
  { path: "/api/cron/invoice-export-jobs", label: "invoice-export-jobs" },
  { path: "/api/cron/recurring-work-orders", label: "recurring-work-orders" },
  { path: "/api/cron/recurring-incident-escalations", label: "recurring-incident-escalations" },
  { path: "/api/cron/document-expiry-reminders", label: "document-expiry-reminders" },
];

const okStatuses = new Set([200, 202]);
let failed = 0;

console.log(`Cron smoke against ${baseUrl} (${jobs.length} jobs)`);

for (const job of jobs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${job.path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${secret}`,
        accept: "application/json",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let summary = text.slice(0, 180).replace(/\s+/g, " ");
    try {
      const json = text.trim() ? JSON.parse(text) : {};
      summary = JSON.stringify(json).slice(0, 180);
    } catch {
      // keep raw slice
    }

    if (!okStatuses.has(response.status)) {
      console.error(`FAIL: ${job.label} → ${response.status}: ${summary}`);
      failed += 1;
      continue;
    }
    console.log(`OK: ${job.label} → ${response.status} ${summary}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL: ${job.label} → ${message}`);
    failed += 1;
  } finally {
    clearTimeout(timer);
  }
}

if (failed > 0) {
  console.error(`FAIL: cron smoke failed for ${failed}/${jobs.length} jobs`);
  process.exit(1);
}

console.log(`OK: cron smoke passed (${jobs.length}/${jobs.length})`);
