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
3. Run migrations: `npx prisma migrate deploy`
4. Start dev server: `npm run dev` (port 3000)

### Key caveats
- The `.env` file is git-ignored and must exist with `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`. Copy from `.env.example`.
- After cleaning the DB or on first setup, use `npx prisma migrate deploy` to apply schema.
- `npx prisma db push` is also available for quick schema sync during development.
- ESLint requires `eslint@8` and `eslint-config-next@14.2.3` (already in devDependencies).
- Integration tests in `__tests__/api.test.ts` require the dev server running on port 3000.
- **Do not run `npm run build` while the dev server is running.** The build writes to `.next/` and corrupts the dev server's webpack runtime. Stop the dev server first, or restart it after building (`rm -rf .next && npm run dev`).

### Commands
| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Dev server | `npm run dev` |
| Tests | `npm test` (watch) / `npm run test:ci` (single run) |
| Migrations | `npx prisma migrate deploy` |
| DB push | `npx prisma db push` |
