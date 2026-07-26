#!/usr/bin/env node
/**
 * P0 ops smoke: public health + authenticated env/schema readiness.
 *
 * Usage:
 *   BASE_URL=https://www.revalta.se node scripts/smoke-ops.mjs
 *
 * Optional:
 *   EMAIL=... PASSWORD=...           reuse owner/admin user (must canViewOperations)
 *   REQUIRE_STRIPE=1                 fail if Stripe is not configured
 *   REQUIRE_EMAIL=1                  fail if email provider/from missing (default on)
 *   REQUIRE_STORAGE=1                fail if Blob/storage missing (default on)
 *   REQUIRE_CRON_SECRET=1            fail if CRON_SECRET missing (default on)
 */
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const email = process.env.EMAIL || `ops-smoke-${Date.now()}@example.com`;
const password = process.env.PASSWORD || `OpsSmoke!${Date.now().toString().slice(-4)}`;
const reuseUser = Boolean(process.env.EMAIL && process.env.PASSWORD);
const requireEmail = process.env.REQUIRE_EMAIL !== "0";
const requireStorage = process.env.REQUIRE_STORAGE !== "0";
const requireCron = process.env.REQUIRE_CRON_SECRET !== "0";
const requireStripe = process.env.REQUIRE_STRIPE === "1";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = { accept: "application/json,text/html;q=0.9,*/*;q=0.8" };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    headers.origin = baseUrl;
    headers.referer = `${baseUrl}/login`;
  }
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = response.headers.getSetCookie?.() || [];
  const rawSetCookie = setCookie.length > 0 ? setCookie : [response.headers.get("set-cookie")].filter(Boolean);
  const text = await response.text();
  let json = null;
  try {
    json = text.trim() ? JSON.parse(text) : {};
  } catch {
    json = null;
  }
  return { status: response.status, text, json, setCookie: rawSetCookie };
}

function cookieFrom(setCookie) {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return first ? String(first).split(";")[0] : "";
}

console.log(`Ops smoke against ${baseUrl}`);

const publicHealth = await request("/api/health");
if (publicHealth.status !== 200 || publicHealth.json?.status !== "ok" || publicHealth.json?.database !== "ok") {
  fail(`public /api/health → ${publicHealth.status}: ${publicHealth.text.slice(0, 300)}`);
}
if (publicHealth.json?.modernStorageOnly !== true && publicHealth.json?.release?.environment === "production") {
  fail("production health missing modernStorageOnly=true");
}
console.log(
  `public health: ok (sha=${publicHealth.json?.release?.commitSha || "?"} modernStorageOnly=${publicHealth.json?.modernStorageOnly})`,
);

if (!reuseUser) {
  const register = await request("/api/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      name: "Ops Smoke",
      companyName: "Ops Smoke AB",
    },
  });
  if (register.status !== 201 && register.status !== 200) {
    fail(`register returned ${register.status}: ${register.text.slice(0, 300)}`);
  }
  console.log(`register: ${register.status}`);
}

const login = await request("/api/auth/login", {
  method: "POST",
  body: { email, password },
});
if (login.status !== 200 || !login.json?.success) {
  fail(`login returned ${login.status}: ${login.text.slice(0, 300)}`);
}
const cookie = cookieFrom(login.setCookie);
if (!cookie) fail("login did not return a session cookie");
console.log("login: 200");

const opsHealth = await request("/api/health", { cookie });
if (opsHealth.status !== 200) {
  fail(`ops /api/health → ${opsHealth.status}: ${opsHealth.text.slice(0, 300)}`);
}
if (!opsHealth.json?.schema?.ready) {
  fail(`schema.ready is false/missing: ${JSON.stringify(opsHealth.json?.schema || {})}`);
}
console.log("ops health: schema.ready=true");

const env = opsHealth.json?.env || {};
function hasFlag(key) {
  return Object.prototype.hasOwnProperty.call(env, key);
}
function flag(key, fallbackKey) {
  if (hasFlag(key)) return Boolean(env[key]);
  if (fallbackKey && hasFlag(fallbackKey)) return Boolean(env[fallbackKey]);
  return null;
}

const checks = [
  ["databaseUrl", flag("databaseUrl"), true],
  ["directUrl", flag("directUrl"), true],
  ["jwtSecret", flag("jwtSecret"), true],
  ["emailFrom", flag("emailFrom"), requireEmail],
  ["emailProvider", flag("emailProvider"), requireEmail],
  ["storage", flag("storage"), requireStorage],
  // Prefer explicit Blob token when the deployed health API exposes it.
  ["blobReadWriteToken", flag("blobReadWriteToken", "storage"), requireStorage],
  ["cronSecret", flag("cronSecret"), requireCron],
  ["stripe", flag("stripe"), requireStripe],
];

const missing = [];
const unknown = [];
for (const [key, value, required] of checks) {
  if (!required) continue;
  if (value === null) unknown.push(key);
  else if (!value) missing.push(key);
}

if (unknown.length) {
  console.log(`WARN: health API saknar ännu flaggorna: ${unknown.join(", ")} (deploya senaste ops-health)`);
}
if (missing.length) {
  fail(`missing critical env flags: ${missing.join(", ")} (from /api/health.env)`);
}

console.log("critical env flags: ok");
console.log(
  [
    `email=${Boolean(env.emailProvider && env.emailFrom)}`,
    `storage=${Boolean(env.storage)}`,
    `blob=${flag("blobReadWriteToken", "storage")}`,
    `cron=${flag("cronSecret")}`,
    `stripe=${Boolean(env.stripe)}`,
    `modernStorageOnly=${Boolean(env.modernStorageOnly ?? opsHealth.json?.modernStorageOnly)}`,
  ].join(" "),
);

console.log("OK: ops smoke passed");
