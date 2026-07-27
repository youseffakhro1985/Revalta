# Revalta releaseprocess

Revalta använder en kontrollerad, stegvis releaseprocess. Målet är att varje produktionsrelease ska vara reproducerbar, verifierad och möjlig att stoppa innan kundtrafik påverkas.

## Grenar

- `main` är produktionsgrenen och får endast innehålla verifierade releaser.
- `release-preview` är den enda gren utöver `main` som automatiskt får skapa Vercel-deployments.
- Feature-, agent- och reparationsgrenar skapar inte automatiska Vercel-deployments.

Detta minskar onödiga deploymentförsök och förhindrar att Vercels dygnskvot förbrukas av enskilda utvecklingscommits.

## Obligatorisk releasegrind

En releasekandidat får inte mergas till `main` förrän följande gäller för samma commit-SHA:

1. Revalta CI är grön.
2. CodeQL är grön.
3. Kandidaten finns på `release-preview`.
4. Vercel deployment för `release-preview` är `Ready`.
5. `Release Boundary Smoke` har passerat mot Preview-URL:en med kandidatens fulla 40-teckens SHA, miljön `preview` och branchen `release-preview`.
6. Kritiska autentiserade och publika funktionssmoke är godkända när testdata och credentials finns.
7. PR-diffen är integrationsgranskad.

Resultat från olika commit-SHA får aldrig kombineras till ett releasegodkännande. En äldre Ready Preview får inte godkänna en nyare commit.

## Arbetsflöde

1. Utveckla och testa på en featuregren.
2. Samla relaterade ändringar innan push när det är praktiskt möjligt.
3. Låt GitHub Actions köra Revalta CI och CodeQL.
4. När båda är gröna, flytta `release-preview` till exakt kandidat-SHA.
5. Vänta tills Vercel markerar deploymenten som `Ready`.
6. Kör GitHub Actions-workflowet `Release Boundary Smoke` manuellt med:
   - `base_url`: exakt HTTPS Preview-URL,
   - `expected_sha`: kandidatens fulla 40-teckens SHA,
   - `expected_environment`: `preview`,
   - `expected_branch`: `release-preview`.
7. Boundary-smoke verifierar:
   - publik startsida och globala säkerhetsheaders,
   - Preview `noindex`,
   - oautentiserad dashboardgräns,
   - same-origin-redirect till `/login`,
   - full privat no-store-policy,
   - `/api/health`, databasstatus och exakt release-SHA,
   - att Vercel-miljö och branch matchar kandidaten.
8. Kör därefter credentialsberoende smoke för inloggning, dashboard, publik portal, ärendeskapning, uppföljning och privata attachmentflöden.
9. Dokumentera SHA, CI-run, CodeQL-run, Preview deployment och smoke-run i release-PR:n.
10. Merge endast efter full grön grind.
11. Efter produktionsdeployment körs samma `Release Boundary Smoke` med:
    - `base_url`: `https://www.revalta.se`,
    - `expected_sha`: mergad release-SHA,
    - `expected_environment`: `production`,
    - `expected_branch`: `main`.

## Lokal körning

```bash
BASE_URL=https://preview.example \
EXPECTED_SHA=<full-40-character-sha> \
EXPECTED_ENVIRONMENT=preview \
EXPECTED_BRANCH=release-preview \
npm run smoke:release-boundaries
```

Smoke-kommandot accepterar aldrig kort SHA, HTTP-URL eller production mot annan branch än `main`.

## Rollback

Vid fel efter produktion:

1. Stoppa vidare merge och deployment.
2. Identifiera senast verifierade produktions-SHA.
3. Rulla tillbaka via Vercel eller revert-commit beroende på felets art.
4. Kör production boundary smoke mot rollback-SHA:n.
5. Kör credentialsberoende health- och funktionssmoke.
6. Dokumentera incident, rotorsak och förebyggande regressionstest.

## Vercel-konfiguration

Automatiska Git-deployments är endast aktiverade för:

```json
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "release-preview": true
    }
  }
}
```

`ignoreCommand` används inte som huvudsaklig kvotkontroll eftersom ignorerade builds fortfarande kan räknas som deployments. Den kontrollerade previewgrenen är den primära grinden.
