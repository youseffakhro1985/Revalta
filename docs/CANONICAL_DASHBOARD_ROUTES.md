# Revalta canonical dashboard routes

## Syfte

Revaltas dashboard ska ha en enda fysisk implementationsyta. URL:erna kan ha historiska alias, men affärs- och UI-implementationer får inte dupliceras mellan två App Router-träd.

## Canonical source tree

Alla riktiga dashboard-sidor ska implementeras under:

`src/app/(dashboard)/dashboard/**`

Route group `(dashboard)` påverkar inte den publika URL:en. Exempel:

- source: `src/app/(dashboard)/dashboard/arbetsorder/page.tsx`
- URL: `/dashboard/arbetsorder`

- source: `src/app/(dashboard)/dashboard/installningar/eskaleringar/page.tsx`
- URL: `/dashboard/installningar/eskaleringar`

## Legacy compatibility tree

`src/app/dashboard/**` får endast innehålla explicita kompatibilitetsroutes som behövs för gamla inkommande länkar. De ska:

1. inte innehålla affärslogik eller egen dashboard-UI,
2. redirecta till en canonical route,
3. ha en centraliserad target-mapping när samma routefamilj har flera alias,
4. behållas tills inkommande länkar och regressionstester är verifierade.

Aktuella kompatibilitetsroutes:

| Legacy URL | Canonical URL | Status |
|---|---|---|
| `/dashboard/arbetsordrar` | `/dashboard/arbetsorder` | Behåll redirect |
| `/dashboard/arbetsordrar/[id]` | `/dashboard/arbetsorder/[id]` | Behåll redirect |
| `/dashboard/arbetsordrar/operationsoversikt` | `/dashboard/arbetsorder/operationsoversikt` | Behåll redirect |

Redirect-targets för denna familj definieras i `src/lib/dashboard-route-compat.ts` och testas i `src/lib/dashboard-route-compat.test.ts`.

## Eskaleringsmigrering

`/dashboard/installningar/eskaleringar` och `/dashboard/installningar/eskaleringar/regler` behåller exakt samma URL. Deras implementationsfiler flyttas från det legacy fysiska trädet till `(dashboard)`-trädet utan omskrivning av UI eller API-anrop.

Detta gör att de använder samma canonical dashboard- och Settings-layoutkedja som övriga inställningssidor, samtidigt som bokmärken och interna länkar fortsätter fungera oförändrat.

## Automatisk integritetskontroll

`scripts/audit-dashboard-integrity.mjs` körs i Revalta CI och är en releasegrind. Kontrollen:

- bygger en routekatalog från alla canonical `page.tsx` under `(dashboard)`,
- verifierar statiska interna `/dashboard/**`-länkar mot verkliga routes,
- stoppar nya interna länkar som använder ett känt legacy-alias,
- verifierar att varje `page.tsx` i legacy-trädet använder `redirect(...)` och inte återinför parallell dashboard-UI.

Det gör canonical-principen maskinellt verifierbar i varje PR i stället för att vara enbart dokumentation.

## Regel för framtida routes

- Ny dashboardfunktion: skapa endast under `src/app/(dashboard)/dashboard/**`.
- Ny legacy alias-route: tillåten under `src/app/dashboard/**` endast som redirectadapter.
- Flytta aldrig en route genom att samtidigt ändra både URL, datamodell och UI i samma PR.
- Ta inte bort ett legacy alias förrän code search, tester och produktionstelemetri visar att aliaset inte längre behövs.
