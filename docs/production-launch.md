# Produktionschecklista för Revalta

Den här checklistan ska vara uppfylld före och efter varje produktionsrelease.

## 1. Databas

- Ta en verifierad återställningsbar backup före en migration som ändrar produktionsdata.
- Sätt både `DATABASE_URL` och `DIRECT_URL` i Vercel Production.
- Använd en direkt databasanslutning för migrationer när leverantören kräver det.
- Kontrollera att `prisma migrate status` inte visar okända eller misslyckade migrationer.
- Produktionsbygget ska avbrytas om `prisma migrate deploy` misslyckas.

Migrationen `20260713190000_add_work_orders_and_projects` är idempotent. Buildskriptet kan markera just en tidigare misslyckad körning av den migrationen som återställd och därefter göra ett säkert nytt försök. Inga andra misslyckade migrationer löses automatiskt.

## 2. Obligatoriska hemligheter

- `JWT_SECRET`: minst 32 slumpmässiga byte.
- `DATABASE_URL` och `DIRECT_URL`: produktionsdatabasen.
- `PUBLIC_PORTAL_COMPANY_ID`: organisationen som får visas i den gemensamma boendeportalen.
- `EMAIL_PROVIDER_API_KEY` och `EMAIL_FROM`: transaktionsmail.
- `STORAGE_PROVIDER_KEY`: privat Vercel Blob-token.
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

## 4. Verifiering efter driftsättning

- `GET /api/health` svarar utan serverfel.
- Registrering, inloggning, utloggning och lösenordsåterställning fungerar.
- En användare kan endast se den egna organisationens fastigheter och ärenden.
- Boendeportalen visar endast fastigheter för `PUBLIC_PORTAL_COMPANY_ID`.
- Skapa ett testärende, tilldela det, kommentera och ladda upp/ladda ned en bilaga.
- Kontrollera att `/dashboard` och `/api/*` skickar `Cache-Control: private, no-store`.
- Kontrollera CSP, HSTS och övriga säkerhetsheaders på `https://www.revalta.se`.

## 5. Återställning

Vid applikationsfel: rulla tillbaka till föregående verifierad Vercel-deployment. Vid datafel: stoppa skrivtrafik, dokumentera tidpunkten och återställ från den verifierade backupen. Ändra aldrig en redan applicerad migration; skapa en ny korrigerande migration.
