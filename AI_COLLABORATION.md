# Revalta AI Collaboration Ledger

GitHub `main` är alltid den enda tekniska sanningskällan. Ingen agent får skriva i ett aktivt område som ägs av en annan agent utan explicit handoff.

## Grundregler

- En task = ett tydligt problemområde = en branch = en PR.
- Kontrollera aktuell `main` SHA direkt före branch-skapande och direkt före merge.
- Gamla Claude/Cursor-branches får inte återanvändas utan compare mot aktuell `main`.
- Tenant isolation är högsta säkerhetsinvarianten.
- Produktionsmigrationer går endast via dokumenterat Database Release-flöde.
- Inga secrets får skrivas i denna fil, PR-beskrivningar, screenshots eller loggar.
- Befintlig svensk/skandinavisk premiumdesign bevaras.

## Snapshot

- Datum: `2026-08-17`
- Baseline `main` för aktiv task: `b9253cda99a79780477ef3b09150ba03c56338cd`
- Commit: `feat: add first-run organisation onboarding`
- Production: `https://www.revalta.se`
- Sprint: **S0 — canonical routes och därefter kritisk E2E**

> SHA-raden är task-baseline. Läs alltid GitHub `main` igen före merge.

## Aktiva / blockerade tasks

| Task-ID | Ägare | Branch | Status | Ägt område | Nästa grind |
|---|---|---|---|---|---|
| REV-ROUTES-001 | ChatGPT | `agent/canonical-dashboard-routes` | **IN PROGRESS** | dashboard route trees, legacy work-order redirects, route compatibility helper/tests, canonical route doc, ledger | Canonical implementation tree under `(dashboard)`; legacy tree endast redirectadapters; full CI/CodeQL/exact-SHA Preview |
| REV-DEMO-001 | ChatGPT | `agent/demo-conversion-flow` | **BLOCKED_ENV — CODE GATE GREEN** | `/demo`, `/api/demo-request`, demo form/mail/tests, marketing header/footer, landing CTA, sitemap, `.env.example`, `INTEGRATIONS.md` | PR #254 draft. Merge först när `DEMO_REQUEST_TO` kan klassas PRESENT och submission smoke kan göras. |
| REV-244-AUDIT | ChatGPT | read-only | LOW PRIORITY | Historisk PR #244 | Endast isolerade follow-ups vid verifierad risk. |
| REV-VERCEL-001 | ChatGPT | read-only | BLOCKED_CONNECTOR | Vercel project/env/runtime | OAuth-team syns men Revalta project/deploy lookup ger 404. Rapportera aldrig secretvärden. |

## Slutförda tasks

| Task-ID | Resultat | PR | Merge SHA | Verifiering |
|---|---|---|---|---|
| REV-COORD-002 | Collaboration ledger + PR-triage | #251 | `b8138046087a7a93c6d346a58658f7bf006097dc` | CI/CodeQL/Preview/Production success |
| REV-NAV-001 | Navigation v2 + Settings/Admin IA | #252 | `354de1e0ba408525a4e47c2b6f16a038929e60f7` | Full CI, CodeQL, exact-SHA Preview; Production success |
| REV-BREAD-001 | Gemensamma breadcrumbs + lokal modulnavigation | #253 | `e24feff5f2e48c22b913b444b6c8ffd5cf82ee63` | Full CI, tester, CodeQL, exact-SHA Preview; Production success |
| REV-COORD-003 | Handoff till Command Center och demo-blocker | #255 | `b7cad49965b3c5c714cea8cc907a2f9170eafc24` | Full CI, CodeQL och Preview success |
| REV-SEARCH-001 | GlobalSearch → Revalta Command Center | #256 | `a93f0fd050e88ba344f96e8d0685d4d3da26153a` | Full CI, CodeQL och exact-SHA Preview success |
| REV-DASH-ROLE-001 | Rollbaserade Owner/Admin, Manager, Technician och Viewer dashboards | #257 | `9147f3e88156d1eb1e6a59c1f70856cc4dba8183` | Full CI, CodeQL och exact-SHA Preview success |
| REV-PROPERTY-001 | Fastigheten som digital fastighetspärm | #258 | `d7d4d5624a16e4b6baf47b82b97fc4777d4d4d0d` | Full CI, CodeQL och exact-SHA Preview success |
| REV-ONBOARD-001 | Tenant-scopad 5-stegs first-run onboarding för Owner/Admin | #262 | `b9253cda99a79780477ef3b09150ba03c56338cd` | Full CI #990, CodeQL #282, exact-SHA Preview och Production success |

## Filägarskap

### REV-DEMO-001 — låst/blockerat

- `src/app/demo/**`
- `src/app/api/demo-request/**`
- `src/lib/demo-request-email*`
- `src/components/demo-request-form.tsx`
- `src/app/page.tsx`
- `src/components/marketing-header.tsx`
- `src/components/site-footer.tsx`
- `src/app/sitemap.ts`
- `.env.example`
- `INTEGRATIONS.md`

### REV-ROUTES-001 — aktivt låst

- `src/app/(dashboard)/dashboard/installningar/eskaleringar/**`
- `src/app/dashboard/installningar/eskaleringar/**`
- `src/app/dashboard/arbetsordrar/**`
- `src/lib/dashboard-route-compat.ts`
- `src/lib/dashboard-route-compat.test.ts`
- `docs/CANONICAL_DASHBOARD_ROUTES.md`
- `AI_COLLABORATION.md`

## REV-ROUTES-001 — canonical kontrakt

- Alla riktiga dashboardimplementationer ska bo i `src/app/(dashboard)/dashboard/**`.
- `src/app/dashboard/**` får endast innehålla legacy-kompatibilitetsredirects.
- `/dashboard/installningar/eskaleringar` och `/regler` behåller oförändrad URL men deras befintliga Git-blobs flyttas byte-identiskt till canonical route group.
- Legacy `/dashboard/arbetsordrar`, `/dashboard/arbetsordrar/[id]` och `/dashboard/arbetsordrar/operationsoversikt` behålls som redirects till singulara `/dashboard/arbetsorder...`.
- Redirect targets centraliseras i `src/lib/dashboard-route-compat.ts` och regressionstestas.
- Ingen UI-, API-, auth-, databas- eller dependencyändring ingår i route-migreringen.

## PR-triage / HOLD

- #254: DEMO — draft / BLOCKED_ENV, kodgate grön.
- #244: MERGED / historisk stor Claude-branch — återanvänd inte direkt.
- #239: HOLD — dokumentarkiv paginering/filter måste reconcileras mot current main.
- #218: FROZEN HISTORICAL STACK.
- #223: HOLD — Prisma major.
- #191: HOLD — actions/checkout major.
- #222: HOLD — CodeQL major.
- #194: HOLD — separat react-dom dependency-task.

## Leveransordning

1. **REV-ROUTES-001 — ACTIVE**
2. REV-E2E-001 — kritiska browser-E2E
3. REV-VERCEL-001 — autentiserad Vercel-audit när connector scope fungerar

REV-DEMO-001 återupptas så snart env-blockern är verifierbar och får inte blandas med ovanstående tasks.

## Handoff / Definition of Done

En task är DONE först när relevant lint, typecheck, tester, full quality gate, CI, CodeQL, exact-SHA Preview, browser smoke när åtkomst finns, accessibility/security/database impact, commit/PR/review/merge, Production deploy/smoke, runtime-loggkontroll och kvarvarande risker är redovisade.
