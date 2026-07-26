# Revalta production hardening audit – 2026-07

Status: inventering och bevis, inga produktionskodändringar.

## 1. Nuläge och git-bevis

Kommandon körda:

```bash
git status
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git log --oneline -15
git diff --stat origin/main...HEAD
```

Resultat:

- Branch: `cursor/production-hardening-audit-6157`
- HEAD: `49da4682bd00aaec5f81ad9bdd76979fe374f3ed`
- `origin/main`: `49da4682bd00aaec5f81ad9bdd76979fe374f3ed`
- Arbetsytan var ren före rapporten.
- Ingen produktionskod ändrades under inventeringen.

## 2. Quality gate

Kravkommandon:

```bash
npm ci
npm run db:validate
npm run lint
npm run test:ci
npm run typecheck
npm run audit:prod
npm run build:ci
```

Resultat:

| Kommando | Resultat |
| --- | --- |
| `npm ci` | Passerade |
| `npm run db:validate` | Föll lokalt: `DIRECT_URL` saknas i lokal miljö |
| `npm run lint` | Passerade |
| `npm run test:ci` | Passerade: 22 testfiler, 120 tester |
| `npm run typecheck` | Passerade |
| `npm run audit:prod` | Passerade: 0 produktionssårbarheter |
| `npm run build:ci` | Passerade |

Notering: `db:validate`-felet är miljörelaterat i agentens lokala shell, inte ett bekräftat schemafel. CI har `DIRECT_URL` satt via workflow.

## A. Systemkarta

Revalta är ett stort svenskt B2B SaaS-system för fastighetsförvaltning.

Inventerade områden:

- Public UI: `/`, `/portal`, auth, legal pages, invite/reset/verify.
- Dashboard UI: fastigheter, ärenden, arbetsorder, projekt, dokument, uthyrning, team, audit, drift, billing, integrationer.
- API: cirka 132 route handlers under 37 domäner.
- Cron: 6 cron endpoints med `CRON_SECRET`.
- Webhook: Stripe webhook.
- Server actions: inga hittades.
- Core libs: auth, session, permissions, current user, storage, integrations, SLA, work orders.
- CI: GitHub Actions för lint/test/typecheck/audit/build och separat databasrelease.

## B. Dubblettrapport

Identifierade överlapp:

1. `dashboard/arbetsorder/*` och `dashboard/arbetsordrar/*`.
   - Två parallella route-träd för arbetsorder.
   - Det ena ligger i dashboard shell, det andra delvis utanför.
   - Risk: dubbla vyer, dubbla länkar, olika UX.

2. `src/components/dashboard/premium-ui.tsx` och `src/components/ui/*`.
   - `premium-ui` är faktiskt canonical i dashboard.
   - `src/components/ui/*` verkar i praktiken vara nästan oanvänt.

3. `AuditLog` används som pseudo-datatabell för flera funktioner.
   - Budget, energi, bokningar, leverantörer, offerter med flera lagrar data i audit metadata.
   - Det fungerar men försvårar typning, tenantkontroll och rapportering.

## C. Säkerhetsrapport

Styrkor:

- JWT-session med httpOnly cookie.
- Session revocation via password-change binding.
- `proxy.ts` blockerar cross-site API-mutationer.
- Central behörighetsmodell finns i `src/lib/permissions.ts`.
- Cron endpoints kräver bearer secret.
- Public portal har rate limiting och referens + e-post.

Risker:

1. Tenantfilter-risker finns kvar i vissa legacy-/satellitmoduler.
   - Exempel: auditlogg-baserade routes som tidigare använde `company_id ?? undefined`.
   - P0-fix påbörjad i separat PR #157, men fler querymönster behöver fortsatt granskas.

2. Vissa GET-routes har svagare rollkontroll än skrivande routes.

3. Public report pages ligger utanför dashboard proxy.
   - De förlitar sig på underliggande API-skydd.

4. Filuppladdning har förbättrats, men magic-byte-validering bör återanvändas konsekvent i alla uploadflöden.

5. Email verification är lagrad men bör granskas för om den ska krävas för känsliga actions.

## D. Databasrapport

Styrkor:

- Prisma-schema innehåller många centrala modeller.
- WorkOrder och Project har required `company_id`.
- Flera relevanta index finns på WorkOrder/Project/Property.
- Migrationer finns och CI testar migrering mot ren Postgres.

Risker:

1. `company_id` är nullable på vissa tenantkritiska objekt.
   - `User`
   - `Property`
   - `Ticket`
   - `AuditLog`
   - `IntegrationEvent`

2. Schema drift:
   - Migrationshistoriken innehåller fler tabeller/kolumner än äldre schema gjorde.
   - Nuvarande schema är bredare än tidigare, men bör fortfarande jämföras mot faktisk production DB.

3. Child-modeller utan `company_id`.
   - `TicketComment`, `TicketAttachment`, `Building`, `Unit` är beroende av parent-scope.

4. Vissa funktioner använder `AuditLog.metadata` som flexibel JSON-lagring.
   - Det ger snabb produktutveckling men sämre dataintegritet och svårare indexering.

## E. Designrapport

Styrkor:

- Revaltas Antigravity-riktning är tydligt dokumenterad.
- Tokens: petroleum, sand, ink, premium shadows.
- `premium-ui` ger konsekventa dashboard primitives.
- Startsida och dashboard rör sig mot svensk premium B2B/proptech.

Risker:

1. Vissa auth- och legacy-sidor har avvikande stil.
2. `src/components/ui/*` och `premium-ui` skapar parallellt komponentlager.
3. Orphan routes utanför shell kan bryta helhetskänslan.
4. Vissa statusfärger använder raw Tailwind-färger istället för tokens.

## F. Funktionsmognad

Produktionsnära:

- Auth/session.
- Dashboard shell.
- Fastigheter.
- Ärenden.
- Team.
- Arbetsorder.
- Projekt.
- Audit.
- SLA-logik.
- Boendeportal.
- CI.

Delvis färdigt eller beroende av externa nycklar:

- E-post.
- SMS.
- Stripe.
- Storage.
- AI.
- Invoice exports.

Mock/dev:

- Integration events när provider saknas.
- Vissa pseudo-moduler som lagrar data i `AuditLog`.

## G. Test- och CI-rapport

Styrkor:

- 22 testfiler.
- 120 tester passerar.
- CI kör Postgres service, Prisma validate, migrations, lint, tests, typecheck, audit och build.
- Work order/SLA/security/session-domänlogik är relativt vältestad.

Gaps:

- Få API route integrationstester.
- Ingen Playwright/Cypress E2E.
- Inga komponenttester.
- Ingen visual regression.
- Ingen coverage threshold.
- Begränsat testskydd för public portal, Stripe webhook, cron och cross-tenant negativa scenarier.

## H. Prioriterad åtgärdsplan

### P0

1. Slutför tenant-isolering:
   - ta bort kvarvarande riskabla filter,
   - förbättra audit/integration/search-scope,
   - lägg negativa cross-tenant tester.

2. Kontrollera dokument- och filåtkomst:
   - inga data-URL-listor,
   - signerad/kontrollerad nedladdning,
   - magic-byte-validering överallt.

3. Kontrollera public portal:
   - tenantbunden portal,
   - ingen intern data,
   - säkra bilagor,
   - rate limiting.

### P1

1. Konsolidera `arbetsorder` och `arbetsordrar`.
2. Bestäm canonical komponentlager: sannolikt `premium-ui`.
3. Flytta orphan dashboard-routes in i dashboard shell eller dokumentera varför.
4. Förbättra rollmatris och läsbehörighet.
5. Skapa API-tester för kritiska routes.

### P2

1. Centralisera statusar och etiketter.
2. Konsolidera SLA-domänlogik.
3. Minska AuditLog som pseudo-tabell.
4. Lägg E2E-smoke för register/login/portal/ticket/work-order.

### P3

1. Storybook/komponentkatalog.
2. Visual regression.
3. A11y-testning.
4. Juridisk granskning.

## I. Första avgränsade PR

Rekommenderad första implementation:

**PR: Fortsatt tenant isolation hardening**

Scope:

1. Skapa eller återanvänd `requireCompany`.
2. Förbjud tysta `undefined`-tenantfilter.
3. Gå igenom alla kvarvarande querymönster i:
   - search,
   - auditlogg-baserade routes,
   - integrationsroute,
   - dokument/filer,
   - export.
4. Lägg tester med två företag:
   - företag A får inte läsa B,
   - företag A får inte uppdatera B,
   - export/search/audit är isolerade.

Rollback:

- PR:en ska bara ändra queryfilter och tester.
- Ingen migration i första PR.
- Rollback är revert av PR om regressionsfel uppstår.

## Slutsats

Revalta är långt kommet och produktionsorienterat, men nästa arbete bör inte vara nya features. Det bör vara konsolidering:

1. tenant-isolering,
2. schema/migrations-synk,
3. arbetsorder-route-konsolidering,
4. API-tester,
5. designkomponent-konsolidering.

Detta dokument är första leveransen. Ingen produktionskod är ändrad.
