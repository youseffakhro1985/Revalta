# Produktionschecklista för Revalta

Den här checklistan ska vara uppfylld före och efter varje produktionsrelease.

## 1. Databas

- Ta en verifierad återställningsbar backup före en migration som ändrar produktionsdata.
- Sätt både `DATABASE_URL` och `DIRECT_URL` i Vercel Production.
- Använd en direkt databasanslutning för migrationer när leverantören kräver det.
- Kontrollera att `prisma migrate status` inte visar okända eller misslyckade migrationer.
- Kör aldrig `prisma migrate deploy` som en oskyddad del av varje Vercel-build.
- Kör `Database Release` manuellt med exakt verifierad commit-SHA och bekräftelsen `MIGRATE_PRODUCTION`.
- Driftsätt endast samma commit som migrationen godkändes för.

### Database Release kräver två GitHub-secrets

Workflowen `.github/workflows/database-release.yml` läser **inte** Vercel-variabler.
Den behöver dessa secrets på GitHub-miljön **Production**:

| Secret | Varifrån |
| --- | --- |
| `DATABASE_URL` | Samma värde som Vercel Production |
| `DIRECT_URL` | Samma värde som Vercel Production (direkt/non-pooled URL när hosten kräver det) |

Steg:

1. Vercel → Project → Settings → Environment Variables → kopiera Production-värdena för `DATABASE_URL` och `DIRECT_URL`.
2. GitHub → Settings → Environments → **Production** → **Environment secrets**.
3. Lägg till/uppdatera `DATABASE_URL` och `DIRECT_URL` (exakta namn).
4. Actions → **Database Release** → Run workflow med merge-commit-SHA + `MIGRATE_PRODUCTION`.

Om workflowen faller på “Validate required secrets” saknas dessa två värden.  
Vercel-miljöer som `Production – revalta` syns i GitHub men används **inte** av Database Release.

Migrationen `20260713190000_add_work_orders_and_projects` är idempotent. Buildskriptet kan markera just en tidigare misslyckad körning av den migrationen som återställd och därefter göra ett säkert nytt försök. Inga andra misslyckade migrationer löses automatiskt.

## 2. Obligatoriska hemligheter

- `JWT_SECRET`: minst 32 slumpmässiga byte.
- `DATABASE_URL` och `DIRECT_URL`: produktionsdatabasen.
- `PUBLIC_PORTAL_COMPANY_ID`: organisationen som får visas i den gemensamma boendeportalen. Revaltas Vercel-projekt har en versionsstyrd publik standard; sätt variabeln för att överstyra den i andra flerorganisationsmiljöer. En installation med exakt ett aktivt företag kan identifieras säkert automatiskt.
- `EMAIL_PROVIDER_API_KEY` och `EMAIL_FROM`: transaktionsmail.
- `BLOB_READ_WRITE_TOKEN`: privat Vercel Blob-token. `STORAGE_PROVIDER_KEY` stöds endast som övergångsreserv.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` och pris-id:n om betalning är aktiverad.

AI och SMS kan aktiveras separat. Sätt aldrig produktionshemligheter i källkod eller publika `NEXT_PUBLIC_*`-variabler.  
Undantag för Database Release: endast `DATABASE_URL` och `DIRECT_URL` får ligga som GitHub Environment secrets på **Production** (se ovan). Övriga secrets hör hemma i Vercel.

## 3. Releasegrind

Följande ska vara grönt på exakt den commit som ska driftsättas:

```bash
npm ci
npm run lint
npm run test:ci
npm run typecheck
npm run build:ci
```

Granska dessutom beroendevarningar, Prisma-migrationsdiff och Vercels preview innan merge till `main`.

## 4. Releaseordning

1. Öppna en pull request från en avgränsad branch.
2. Låt CI validera Prisma-schemat och applicera samtliga migrationer mot ren PostgreSQL.
3. Kräv grönt lint, tester, typkontroll och produktionsbuild.
4. Verifiera Vercel Preview **build** (CI/Vercel grönt). Förvänta dig **inte** fungerande inloggning/dashboard på preview om preview delar produktionsdatabas och PR:n innehåller nya kolumner/tabeller — applikationen frågar då kolumner som inte finns ännu.
5. Mergea pull requesten till `main`.
6. Ta en verifierad databasbackup när releasen innehåller migrationer.
7. Kör `Database Release` för exakt merge-commit (additive soft-delete-kolumner är bakåtkompatibla med föregående app-version).
8. Driftsätt exakt samma commit till Vercel.
9. Kör smoke tests och rulla tillbaka applikationen vid fel.

### Preview vs databas (vanligt inloggningsfel)

Symptom: Vercel Preview är grön, `/api/auth/login` svarar `200`, men listor/dashboard kraschar eller visar schemafel efter redirect.

Orsak: Preview-koden förväntar soft-delete-kolumner (`Ticket.deleted_at`, `Property.deleted_at`, `WorkOrder.deleted_at`, …) medan databasen ännu inte har fått `prisma migrate deploy`.

Kompatibilitet: kritiska list-API:er och dashboard kör **utan** `deleted_at`-filter när kolumnerna saknas (amber “Kompatibilitetsläge”). Soft-delete-skrivningar kräver fortfarande Database Release. Ops: `GET /api/health` → `schema.ready` / `schema.missing`.

Åtgärd för full soft-delete: följ releaseordningen (merge → backup → Database Release → deploy). Testa därefter `BASE_URL=https://www.revalta.se node scripts/smoke-auth-dashboard.mjs`.

## 5. Efter migration: backfill och cron

När releasen innehåller schema cutover (moderna tabeller / soft-delete / `CronJobRun`):

1. Kör `node scripts/backfill-auditlog-modules.mjs` mot produktionsdatabasen (idempotent).
2. Verifiera att kritiska moduler inte längre returnerar `409` för backfill på vanliga arbetsflöden.
3. Smoke-testa cron med `CRON_SECRET`:
   - `/api/cron/preventive-maintenance` → journal i `CronJobRun`
   - `/api/cron/recurring-incident-escalations` → journal i `CronJobRun`
   - `/api/cron/invoice-export-jobs` → jobb i `WorkOrderInvoiceExportJob`
4. Kontrollera att soft-deletade tickets/fastigheter/avtal och makulerade IMD-avläsningar inte syns i listor.
5. När backfill och smoke är godkända: sätt `REVALTA_MODERN_STORAGE_ONLY=1` i Vercel Production för att stänga dual-read-listor (migreringssteg 6). Verifiera att kritiska listor fortfarande visar förväntade antal innan flaggan lämnas på.

## 6. Verifiering efter driftsättning

- `GET /api/health` svarar utan serverfel.
- Inloggad ops: `GET /api/health` visar `schema.ready: true` (annars saknas soft-delete-migrationer).
- Snabb rök: `BASE_URL=https://www.revalta.se node scripts/smoke-auth-dashboard.mjs`
- Cron-rök: `BASE_URL=https://www.revalta.se CRON_SECRET=... node scripts/smoke-cron.mjs`
- Schema-only: `DATABASE_URL=... DIRECT_URL=... node scripts/check-schema-readiness.mjs`
- Registrering, inloggning, utloggning och lösenordsåterställning fungerar.
- En användare kan endast se den egna organisationens fastigheter och ärenden.
- Boendeportalen visar endast fastigheter för `PUBLIC_PORTAL_COMPANY_ID`.
- Skapa ett testärende, tilldela det, kommentera och ladda upp/ladda ned en bilaga.
- Kontrollera att `/dashboard` och `/api/*` skickar `Cache-Control: private, no-store`.
- Kontrollera CSP, HSTS och övriga säkerhetsheaders på `https://www.revalta.se`.

## 7. Återställning

Vid applikationsfel: rulla tillbaka till föregående verifierad Vercel-deployment. Vid datafel: stoppa skrivtrafik, dokumentera tidpunkten och återställ från den verifierade backupen. Ändra aldrig en redan applicerad migration; skapa en ny korrigerande migration.
