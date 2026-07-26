#!/usr/bin/env node
/**
 * Post-migrate smoke: register/login → dashboard → schema-sensitive APIs.
 *
 * Usage:
 *   BASE_URL=https://www.revalta.se node scripts/smoke-auth-dashboard.mjs
 *
 * Optional:
 *   EMAIL=... PASSWORD=...  (reuse an existing user instead of registering)
 */
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const email = process.env.EMAIL || `smoke-${Date.now()}@example.com`;
const password = process.env.PASSWORD || `SmokeLogin!${Date.now().toString().slice(-4)}`;
const reuseUser = Boolean(process.env.EMAIL && process.env.PASSWORD);

function parseSetCookie(headerValue) {
  if (!headerValue) return null;
  const first = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return String(first).split(";")[0];
}

async function request(path, { method = "GET", body, cookie, origin } = {}) {
  const headers = {
    accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    headers.origin = origin || baseUrl;
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

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

console.log(`Smoke against ${baseUrl}`);

if (!reuseUser) {
  const register = await request("/api/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      name: "Smoke Auth",
      companyName: "Smoke AB",
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

const sessionCookie = login.setCookie
  .map(parseSetCookie)
  .find((part) => part && part.startsWith("__Host-revalta_session="));
if (!sessionCookie) {
  fail("login did not set __Host-revalta_session");
}
console.log("login: 200 + session cookie");

const dashboard = await request("/dashboard", { cookie: sessionCookie });
if (dashboard.status !== 200) {
  fail(`/dashboard returned ${dashboard.status}`);
}
if (/__next_error__/i.test(dashboard.text)) {
  fail("/dashboard rendered Next error page");
}
console.log("dashboard: 200");

const listPaths = [
  "/api/properties",
  "/api/tickets",
  "/api/work-orders",
  "/api/projects",
  "/api/leases",
  "/api/notifications",
  "/api/insurance-claims",
  "/api/bookings",
  "/api/quotes",
  "/api/search?q=test",
];

for (const path of listPaths) {
  const result = await request(path, { cookie: sessionCookie });
  if (result.status !== 200) {
    fail(`${path} returned ${result.status}: ${result.text.slice(0, 300)}`);
  }
  console.log(`${path}: 200`);
}

const health = await request("/api/health", { cookie: sessionCookie });
if (health.status === 503 && health.json?.schema?.ready === false) {
  console.log("api/health: 503 schema.ready=false (compatibility mode — migrate before production cutover)");
} else if (health.status === 200) {
  console.log(`api/health: 200 schema.ready=${health.json?.schema?.ready ?? "n/a"}`);
} else if (health.status === 403) {
  console.log("api/health: 403 (ops role required for schema details)");
} else {
  fail(`/api/health returned ${health.status}: ${health.text.slice(0, 300)}`);
}

console.log("OK: auth + dashboard + module list smoke passed");
