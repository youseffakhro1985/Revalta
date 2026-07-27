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
5. Preview-smoke verifierar kritiska flöden.
6. PR-diffen är integrationsgranskad.

Resultat från olika commit-SHA får aldrig kombineras till ett releasegodkännande.

## Arbetsflöde

1. Utveckla och testa på en featuregren.
2. Samla relaterade ändringar innan push när det är praktiskt möjligt.
3. Låt GitHub Actions köra Revalta CI och CodeQL.
4. När båda är gröna, flytta `release-preview` till exakt kandidat-SHA.
5. Vänta tills Vercel markerar deploymenten som `Ready`.
6. Kör smoke mot Preview-URL:
   - `/api/health`
   - inloggning
   - dashboard
   - publik portal
   - ärendeskapning och uppföljning
   - privata attachmentflöden
7. Dokumentera SHA, CI-run, CodeQL-run och Preview deployment i release-PR:n.
8. Merge endast efter full grön grind.
9. Verifiera produktionens release-SHA och smoke efter deployment.

## Rollback

Vid fel efter produktion:

1. Stoppa vidare merge och deployment.
2. Identifiera senast verifierade produktions-SHA.
3. Rulla tillbaka via Vercel eller revert-commit beroende på felets art.
4. Kör produktionens health- och smoke-kontroller.
5. Dokumentera incident, rotorsak och förebyggande regressionstest.

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
