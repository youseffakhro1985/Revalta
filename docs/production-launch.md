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

Migrationen `20260713190000_add_work_orders_and_projects` är idempotent. Buildskriptet kan markera just en tidigare misslyckad körning av den migrationen som återställd och därefter göra ett säkert nytt försök. Inga andra misslyckade migrationer löses automatiskt.

## 2. Obligatoriska hemligheter

- `JWT_SECRET`: minst 32 slumpmässiga byte.
- `DATABASE_URL` och `DIRECT_URL`: produktionsdatabasen.
- `PUBLIC_PORTAL_COMPANY_ID`: organisationen som får visas i den gemensamma boendeportalen. Revaltas Vercel-projekt har en versionsstyrd publik standard; sätt variabeln för att överstyra den i andra flerorganisationsmiljöer. En installation med exakt ett aktivt företag kan identifieras säkert automatiskt.
- `EMAIL_PROVIDER_API_KEY` och `EMAIL_FROM`: transaktionsmail.
- `BLOB_READ_WRITE_TOKEN`: privat Vercel Blob-token. `STORAGE_PROVIDER_KEY` stöds endast som övergångsreserv.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` och pris-id:n om betalning är aktiverad.

AI och SMS kan aktiveras separat. Sätt aldrig produktionshemligheter i GitHub, källkod eller publika `NEXT_PUBLIC_*`-variabler.

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
4. Verifiera Vercel Preview utan produktionsmigrationer.
5. Mergea pull requesten till `main`.
6. Ta en verifierad databasbackup när releasen innehåller migrationer.
7. Kör `Database Release` för exakt merge-commit.
8. Driftsätt exakt samma commit till Vercel.
9. Kör smoke tests och rulla tillbaka applikationen vid fel.

## 5. Verifiering efter driftsättning

- `GET /api/health` svarar utan serverfel.
- Registrering, inloggning, utloggning och lösenordsåterställning fungerar.
- En användare kan endast se den egna organisationens fastigheter och ärenden.
- Boendeportalen visar endast fastigheter för `PUBLIC_PORTAL_COMPANY_ID`.
- Skapa ett testärende, tilldela det, kommentera och ladda upp/ladda ned en bilaga.
- Kontrollera att `/dashboard` och `/api/*` skickar `Cache-Control: private, no-store`.
- Kontrollera CSP, HSTS och övriga säkerhetsheaders på `https://www.revalta.se`.

## 6. Återställning

Vid applikationsfel: rulla tillbaka till föregående verifierad Vercel-deployment. Vid datafel: stoppa skrivtrafik, dokumentera tidpunkten och återställ från den verifierade backupen. Ändra aldrig en redan applicerad migration; skapa en ny korrigerande migration.
