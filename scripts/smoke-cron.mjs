#!/usr/bin/env node
/**
 * Post-migrate cron smoke (requires CRON_SECRET).
 *
 * Usage:
 *   BASE_URL=https://www.revalta.se CRON_SECRET=... node scripts/smoke-cron.mjs
 */
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || "";

if (!secret) {
  console.error("FAIL: CRON_SECRET is required");
  process.exit(1);
}

const jobs = [
  "/api/cron/preventive-maintenance",
  "/api/cron/recurring-incident-escalations",
  "/api/cron/invoice-export-jobs",
];

for (const path of jobs) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const text = await response.text();
  let json = null;
  try {
    json = text.trim() ? JSON.parse(text) : {};
  } catch {
    json = null;
  }
  if (![200, 202].includes(response.status)) {
    console.error(`FAIL: ${path} → ${response.status}: ${text.slice(0, 400)}`);
    process.exit(1);
  }
  console.log(`${path}: ${response.status}`, json && typeof json === "object" ? JSON.stringify(json).slice(0, 160) : "");
}

console.log("OK: cron smoke passed");
