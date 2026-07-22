# Publicera Revalta på Vercel

Den här versionen är byggd för Vercel med Next.js, Prisma och PostgreSQL.

## Viktigt innan publicering

Använd aldrig en ny tom databas som ersättning för befintlig verksamhetsdata. Validera först migrationerna mot ren PostgreSQL och därefter mot en återställningsbar stagingkopia av produktionsdatabasen. Ta en verifierad backup före varje produktionsmigration som kan ändra data.

## Vercel-inställningar

I Vercel-projektet för `revalta.se`:

1. Gå till **Settings → Environment Variables**.
2. Lägg in dessa variabler för **Development**, **Preview** och **Production** där respektive miljö behöver ett fungerande backendflöde:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET`
   - `EMAIL_FROM`
3. Lägg in dessa när riktiga leverantörer ska kopplas:
   - `EMAIL_PROVIDER_API_KEY`
   - `SMS_PROVIDER_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `BLOB_READ_WRITE_TOKEN` (privat Vercel Blob-token; `STORAGE_PROVIDER_KEY` stöds endast som övergångsreserv)
   - `AI_PROVIDER_API_KEY`

## Build

Vercel ska använda:

- Node.js: `22.x`
- Install Command: `npm ci`
- Build Command: `npm run build`

`npm run build` kör:

1. `prisma generate`
2. `next build --webpack`

Produktionsmigrationer körs separat i GitHub Actions-flödet `Database Release`. `RUN_DB_MIGRATIONS` ska normalt inte vara satt i Vercel.

## Publicering

1. Kräv gröna kvalitetskontroller och en godkänd Vercel Preview på pull requesten.
2. Mergea pull requesten till `main` och notera exakt merge-commit.
3. Om releasen innehåller migrationer: ta backup och kör `Database Release` med exakt samma commit-SHA.
4. Driftsätt exakt den verifierade committen till Vercel.
5. Kontrollera att Next.js-bygget slutar utan fel och att Vercel visar `Ready`.
6. Öppna `https://www.revalta.se` och verifiera att apexdomänen har avsedd canonical-omdirigering.
7. Skapa ett särskilt testkonto och verifiera:
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

- `DATABASE_URL` saknas eller pekar fel i aktuell Vercel-miljö.
- `DIRECT_URL` saknas i aktuell Vercel-miljö.
- Databasen är inte PostgreSQL.
- Den gamla databasen har en schema-struktur som krockar med nya migrationer.
- `JWT_SECRET` saknas i production.

Läs den fullständiga byggloggen och åtgärda den verifierade grundorsaken. Byt eller radera aldrig produktionsdatabasen för att få ett bygge att passera.
