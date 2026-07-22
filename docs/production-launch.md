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

En misslyckad eller avbruten produktionsmigration ska alltid utredas manuellt. Ändra aldrig migrationshistoriken eller markera en migration som återställd utan att först verifiera databasens faktiska schema och data.

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
npm run test:e2e
```

Granska dessutom beroendevarningar, Prisma-migrationsdiff och Vercels preview innan merge till `main`.

## 4. Releaseordning

1. Öppna en pull request från en avgränsad branch.
2. Låt CI validera Prisma-schemat och applicera samtliga migrationer mot ren PostgreSQL.
3. Kräv grönt lint, tester, typkontroll och produktionsbuild.
4. Verifiera Vercel Preview utan produktionsmigrationer.
5. För en release utan schemaändring: mergea pull requesten och låt Vercel driftsätta exakt den verifierade merge-committen.
6. För en release med schemaändring: kräv en framåt- och bakåtkompatibel expand-migration, verifierad backup och uttryckligt produktionsgodkännande. Mergea först när både gammal och ny applikationskod fungerar mot expansionsschemat.
7. Kör `Database Release` för exakt merge-commit och verifiera migrationsstatus. Vercels automatiska `main`-deployment får inte antas vara en databasgrind; kontrollera dess status separat.
8. Verifiera att Vercel-deploymenten avser exakt samma commit.
9. Kör smoke tests och rulla tillbaka applikationen vid fel. Databasrollback sker genom en ny, granskad framåtmigration eller verifierad backupåterställning—aldrig genom att redigera en applicerad migration.

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
