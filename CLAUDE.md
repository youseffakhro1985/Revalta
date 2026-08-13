@AGENTS.md

# Revalta — orientation for coding agents

Multi-tenant SaaS for Swedish professional property management. `Company` is the tenant. A user
from one company must never be able to read or write another company's data — this is the single
highest-priority invariant in this codebase. When in doubt, re-read this section before touching a
data-access path.

## Stack

Next.js 16 App Router, React 19, TypeScript, Tailwind, Prisma 5 + PostgreSQL, Vercel (app + private
Blob storage), Vitest. Node version is pinned in `.nvmrc` — keep it in sync with the Vercel project's
Node setting rather than assuming your training data's default.

## Tenant isolation

- Every request handler starts with `getCurrentUser()` (`src/lib/current-user.ts`), then scopes reads
  with `tenantWhere` / `companyScopedWhere` / `auditScopedWhere`, and gates access with
  `requireCompanyMember` / `requireCompanyUser` / `requireStaffCompanyUser`.
- Tenant-scoped writes (update/delete) go through `updateOwnedByCompany` / `deleteOwnedByCompany` in
  `src/lib/tenant-writes.ts` — these enforce `company_id` in the `WHERE`, not just the `SELECT`.
- A route that builds its own Prisma `where` by hand instead of using these helpers is a red flag;
  check it carefully before merging.

## Auth

JWT session via `jose`, `__Host-`-prefixed httpOnly cookie (`src/lib/session-policy.ts`), 8h TTL, with
a legacy `token` cookie fallback during migration. Don't swap the auth provider or cookie model without
an explicit product decision — it's load-bearing for every tenant-isolation check above it.

## Idempotency / concurrency

Cron jobs and other retryable business logic use Postgres advisory locks, not application-level
mutexes: `db.$transaction(async (tx) => { const [{ locked }] = await tx.$queryRaw<...>(Prisma.sql\`SELECT
pg_try_advisory_xact_lock(hashtext(${key})) AS locked\`); if (!locked) return; ... })`. Reuse this
pattern rather than inventing a new one — see `src/lib/recurring-incident-storage.ts` for a worked
example, including the `vi.mock("@prisma/client", ...)` shim its test needs.

## Mocks must fail closed in production

`src/lib/runtime-env.ts` exports two different guards — use the right one:
- `isProductionRuntime()` — true whenever this is really production. Use this directly for anything
  that touches money or another real integration side effect (Stripe, invoicing). Never let
  `ALLOW_INTEGRATION_MOCKS=1` bypass this.
- `allowIntegrationMocks()` — `isProductionRuntime()` plus the `ALLOW_INTEGRATION_MOCKS` override. Only
  appropriate for genuinely low-stakes, easily-reversible mock paths.

## Database migrations

Additive `CREATE INDEX IF NOT EXISTS` / schema SQL under `prisma/migrations/<timestamp>_<name>/`.
Applied to production **only** via the manual "Database Release" GitHub Actions workflow
(`workflow_dispatch`, requires a verified commit SHA + typed confirmation) — never via the Vercel
build, and never by running `prisma db push`/`migrate deploy` against production yourself. See
`DEPLOYMENT.md`.

## Logging

Use `createLogger()` / `createRouteObservability()` from `src/lib/structured-logger.ts` and
`src/lib/route-observability.ts` instead of raw `console.error`. The logger auto-redacts common secret
shapes (tokens, passwords, credential URLs), which `console.error(..., error)` does not.

## Testing gotchas

- `prisma generate` requires network access to `binaries.prisma.sh`. If that's unavailable in your
  sandbox, `typecheck`, `build:ci`, and any test file that instantiates a real Prisma client will fail
  for that reason alone — not necessarily because of your change. Tests that `vi.mock("@/lib/db", ...)`
  work fine without it; prefer that pattern for new route tests.
- A test touching `Prisma.sql` needs a stub since the real client can't generate:
  `vi.mock("@prisma/client", () => ({ Prisma: { sql: (s, ...v) => ({ strings: s, values: v }) } }))`.
- `npm run quality` is the full local gate (release-config validation, lint, UI-interaction audit,
  tests, typecheck, prod audit, build). Real CI is the source of truth if your sandbox can't run all of
  it — don't declare a change verified without seeing it pass there.

## Design system

Petroleum / sand / ink Skandinavian premium tokens — see the design direction in `AGENTS.md` and
`DESIGN_SYSTEM.md`. This is a mature, already-designed product: match existing components and spacing
rather than introducing new visual patterns, and treat any UI change as polish (a few percent better),
not a redesign.

## Other docs

`SECURITY.md` (secrets, credential-rotation runbook), `DEPLOYMENT.md` (release process),
`INTEGRATIONS.md` (per-integration mock/live status).
