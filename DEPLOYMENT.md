# Publicera Revalta på Vercel

Den här versionen är byggd för Vercel med Next.js, Prisma och PostgreSQL.

## Viktigt innan publicering

Använd helst en ny tom PostgreSQL-databas för den nya Revalta-versionen. Om den gamla sidan på `revalta.se` använder en annan databasstruktur kan migrationerna annars krocka med gamla tabeller.

## Vercel-inställningar

I Vercel-projektet för `revalta.se`:

1. Gå till **Settings → Environment Variables**.
2. Lägg in dessa variabler för **Production**:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET`
   - `EMAIL_FROM`
3. Lägg in dessa när riktiga leverantörer ska kopplas:
   - `EMAIL_PROVIDER_API_KEY`
   - `SMS_PROVIDER_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STORAGE_PROVIDER_KEY`
   - `AI_PROVIDER_API_KEY`

## Build

Vercel ska använda:

- Install Command: `npm install`
- Build Command: `npm run build`

`npm run build` kör:

1. `prisma generate`
2. `prisma migrate deploy`
3. `next build --webpack`

## Publicering

1. Merge:a PR #3 till `main`.
2. Vercel startar automatiskt en ny produktion-deploy om projektet är kopplat till GitHub.
3. Kontrollera Vercel-loggarna:
   - Prisma migrationer ska köras utan fel.
   - Next build ska sluta med `Compiled successfully`.
4. Öppna `https://revalta.se`.
5. Skapa ett nytt konto och verifiera:
   - Dashboard
   - Team
   - Fastigheter
   - Ärenden
   - AI-analys
   - Bilagor
   - Billing
   - Audit
   - Integrationer

## Om deployen misslyckas

Vanliga orsaker:

- `DATABASE_URL` saknas eller pekar fel.
- `DIRECT_URL` saknas.
- Databasen är inte PostgreSQL.
- Den gamla databasen har en schema-struktur som krockar med nya migrationer.
- `JWT_SECRET` saknas i production.

Lösning: skapa en ny tom PostgreSQL-databas, lägg in nya URL:er i Vercel och kör om deployment.
