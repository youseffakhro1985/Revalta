<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Architecture
- **App**: Next.js 14.2.3 App Router + TypeScript + Tailwind CSS
- **Database**: PostgreSQL 15 via Docker (`docker-compose.yml`)
- **ORM**: Prisma 5 (`prisma/schema.prisma`)
- **Auth**: Custom JWT (jose + bcryptjs)

### Starting services
1. Start Docker daemon: `dockerd &>/var/log/dockerd.log &` (wait ~3s)
2. Start PostgreSQL: `docker compose up -d` (from repo root)
3. Sync DB schema: `npx prisma db push` (use this instead of `prisma migrate deploy` — the migration SQL is out of sync with `schema.prisma`)
4. Start dev server: `npm run dev` (port 3000)

### Key caveats
- The `.env` file is git-ignored and must exist with `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`. Defaults: `postgresql://postgres:postgres@localhost:5432/revalta` and `revalta_super_secret_key_2026`.
- **Migration vs schema mismatch**: `prisma/migrations/20260426171352_init/migration.sql` creates a much more complex schema (with enums, many tables) than `schema.prisma` defines. Always use `npx prisma db push` to sync the DB to match the Prisma schema the app code expects.
- The README mentions SQLite/better-sqlite3 but the actual codebase uses PostgreSQL — README is outdated.
- ESLint is not pre-configured; the `.eslintrc.json` with `"extends": "next/core-web-vitals"` plus `eslint@8` and `eslint-config-next@14.2.3` as devDependencies are needed for `npm run lint` to work.
- No test framework is configured (no Jest/Vitest/Playwright in dependencies).

### Commands
| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Dev server | `npm run dev` |
| DB push | `npx prisma db push` |
