# Säkerhetsrutiner för Revalta

## Efter delade nycklar

Om en Vercel-token eller databaslänk har delats i chatt, gör alltid detta:

1. Radera Vercel-tokenen i Vercel.
2. Byt Neon-lösenord.
3. Uppdatera `DATABASE_URL` och `DIRECT_URL` i Vercel.
4. Kör en ny production deployment.
5. Testa `/register`, `/login` och `/portal`.

## Produktionshemligheter

Minimikrav i Vercel Production:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `EMAIL_FROM`

Valfria live-integrationer:

- `EMAIL_PROVIDER_API_KEY`
- `SMS_PROVIDER_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STORAGE_PROVIDER_KEY`
- `AI_PROVIDER_API_KEY`

## Rensa testdata

Scriptet nedan tar endast bort data kopplad till testadresser som slutar på `@example.se` eller `@example.com`, samt tydliga testbolag.

```bash
DATABASE_URL="postgresql://..." DIRECT_URL="postgresql://..." node scripts/cleanup-test-data.mjs
```

Kör inte scriptet om du har riktiga användare med testdomänerna `example.se` eller `example.com`.
