# Revalta

Revalta är en svensk plattform för fastighetsförvaltning. Applikationen samlar fastigheter, felanmälningar, arbetsorder, projekt, underhåll, dokument, ekonomi och boendedialog i ett tenant-isolerat arbetsflöde.

## Teknisk grund

- Next.js 16 med App Router och TypeScript
- PostgreSQL och Prisma
- JWT-session i `httpOnly`-cookie
- Tailwind CSS
- Vercel för applikation och privat blobblagring
- Vitest, ESLint, TypeScript och produktionsbuild i CI

## Kom igång lokalt

Förutsättningar: Node.js 22 samt PostgreSQL.

```bash
npm ci
cp .env.example .env
npm run db:validate
npm run db:dev
npm run dev
```

Applikationen finns därefter på [http://localhost:3000](http://localhost:3000).

## Kvalitetskontroller

```bash
npm run lint
npm run test:ci
npm run typecheck
npm run build:ci
```

Varken `build:ci` eller Vercels normala byggkommando applicerar produktionsmigrationer. Produktionsmigrationer körs separat genom det skyddade GitHub Actions-flödet `Database Release`, mot en uttryckligen verifierad commit, innan samma commit driftsätts.

## Miljövariabler

Kopiera `.env.example` och konfigurera minst:

- `DATABASE_URL` och `DIRECT_URL`
- `JWT_SECRET` med ett långt slumpmässigt värde
- `PUBLIC_PORTAL_COMPANY_ID` för att låsa den delade boendeportalen till rätt organisation i en flerorganisationsmiljö. Revaltas Vercel-projekt har en versionsstyrd publik standard som variabeln kan överstyra.
- leverantörsnycklar för e-post, SMS, Stripe, privat fillagring och AI när funktionerna ska köras skarpt

Utan integrationsnycklar används spårbara utvecklingshändelser där det stöds. Se [produktionschecklistan](docs/production-launch.md) före driftsättning.

## Viktiga delar

- `/dashboard` – skyddad förvaltningsyta
- `/portal` – publik boendeportal, uttryckligen bunden till en organisation
- `/api/health` – driftstatus
- `prisma/schema.prisma` – datamodell
- `prisma/migrations` – versionsstyrda databasmigrationer
- `docs` – arkitektur, releaseunderlag och funktionsspecifikationer

## Säkerhetsprinciper

All organisationsdata filtreras server-side. Inaktiva användare och företag nekas session, skrivande API-anrop har origin-skydd, känsliga svar cachelagras inte och nya bilagor lagras privat. Hemligheter ska endast sättas i driftsmiljön och får aldrig checkas in.
