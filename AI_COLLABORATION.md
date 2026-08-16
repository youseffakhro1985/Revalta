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
- Om en task blockeras externt kan nästa icke-överlappande task aktiveras först när filägarskapet är dokumenterat här.

## Snapshot

- Datum: `2026-08-17`
- Baseline `main` för aktiv task: `b7cad49965b3c5c714cea8cc907a2f9170eafc24`
- Commit: `docs: hand off to Command Center task`
- Production: `https://www.revalta.se`
- Sprint: **S0 — IA, conversion och Command Center**
- Historiska Claude/Cursor-branches: HOLD tills explicit task + current-main compare.

> SHA-raden är task-baseline. Läs alltid GitHub `main` igen före merge.

## Aktiva / blockerade tasks

| Task-ID | Ägare | Branch | Status | Ägt område | Nästa grind |
|---|---|---|---|---|---|
| REV-SEARCH-001 | ChatGPT | `agent/command-center` | **IN PROGRESS** | `global-search.tsx`, `command-center-*` support/tests, `/api/search` + test, ledger | GlobalSearch ska bli Command Center utan parallell search; tenant/role/assigned-work scope bevaras; local state isoleras per user-id; CI/CodeQL/exact-SHA Preview krävs. |
| REV-DEMO-001 | ChatGPT | `agent/demo-conversion-flow` | **BLOCKED_ENV — CODE GATE GREEN** | `/demo`, `/api/demo-request`, demo form/mail/tests, marketing header/footer, landing CTA, sitemap, `.env.example`, `INTEGRATIONS.md` | PR #254 draft. CI #978 + CodeQL #269 + Preview `5936266435` success. Merge först när `DEMO_REQUEST_TO` kan klassas PRESENT och submission smoke kan göras. |
| REV-244-AUDIT | ChatGPT | read-only | LOW PRIORITY | Historisk PR #244 | Endast isolerade follow-ups vid verifierad risk. |
| REV-VERCEL-001 | ChatGPT | read-only | BLOCKED_CONNECTOR | Vercel project/env/runtime | OAuth-team syns men Revalta project/deploy lookup ger 404. Rapportera aldrig secretvärden. |

## Slutförda tasks

| Task-ID | Resultat | PR | Merge SHA | Verifiering |
|---|---|---|---|---|
| REV-COORD-002 | Collaboration ledger + PR-triage | #251 | `b8138046087a7a93c6d346a58658f7bf006097dc` | CI/CodeQL/Preview/Production success |
| REV-NAV-001 | Navigation v2 + Settings/Admin IA | #252 | `354de1e0ba408525a4e47c2b6f16a038929e60f7` | Full CI, CodeQL, exact-SHA Preview; Production `5936152663` success |
| REV-BREAD-001 | Gemensamma breadcrumbs + lokal modulnavigation; tenant-safe AO-label | #253 | `e24feff5f2e48c22b913b444b6c8ffd5cf82ee63` | Full CI, 135 testfiler/783 tester, CodeQL, exact-SHA Preview; Production `5936223118` success |
| REV-COORD-003 | Handoff till Command Center och demo-blocker dokumenterad | #255 | `b7cad49965b3c5c714cea8cc907a2f9170eafc24` | Full CI, CodeQL och Vercel Preview success |

## Filägarskap

### REV-DEMO-001 — låst

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

### REV-SEARCH-001 — aktivt låst

- `src/components/dashboard/global-search.tsx`
- `src/components/dashboard/command-center-state.ts`
- `src/components/dashboard/command-center-state.test.ts`
- `src/components/dashboard/command-center-actions.ts`
- `src/components/dashboard/command-center-actions.test.ts`
- `src/app/api/search/route.ts`
- `src/app/api/search/route.test.ts`
- `AI_COLLABORATION.md`

Dashboard layout/shell är **inte** del av slutligt SEARCH-scope; en kortlivad branchändring i layouten återställdes till exakt main-innehåll innan PR.

## REV-SEARCH-001 — implementerad riktning hittills

- Befintlig `GlobalSearch` utvecklas till ett Command Center; ingen ny parallell search-komponent.
- `⌘K/Ctrl+K` och mobiltrigger behålls.
- Tomt läge visar rollstyrda snabbåtgärder (`Ny arbetsorder`, `Registrera ärende`, `Lägg till fastighet`, `Bjud in team`) via befintliga permission helpers.
- Modulnavigation återanvänder `staffPrimaryNavigation`, `visibleDashboardSections(role)` och `staffSettingsNavigation` från Navigation v2.
- `/api/search` söker nu även arbetsordrar på titel, beskrivning och AO-nummer.
- Arbetsordersökning är strikt `company_id`-scopad och technicians får endast tilldelade arbetsordrar, samma princip som övrigt operativt scope.
- Search-respons är `private, no-store`.
- Favoriter och senaste objekt sparas endast lokalt, namespacat med autentiserat opaque user-id från befintliga `/api/settings/profile`.
- Persisted state validerar result type, längder och att href börjar med `/dashboard/`; manipulerad extern URL ignoreras.
- Favoriter/senaste har hårda maxgränser och dubblettskydd.
- Servern är fortsatt sanningskälla för live-sökresultat; lokal state är endast UX-minne.

## Verifierade findings

- `/api/search` var redan autentiserad och tenant-scopad; leasingdirectory är rollstyrd och technician ticket-sökning assigned-scopad.
- Prisma `WorkOrder` har `company_id`, `assigned_to_id`, `work_order_number`, `deleted_at` och relation till Property, så utökningen kräver ingen migration eller rå SQL.
- DEMO-blockern är fortsatt extern env-verifiering, inte kodkvalitet.
- Legacy route cleanup förblir separat REV-ROUTES-001.

## PR-triage / HOLD

- #244: MERGED / historisk stor Claude-branch — återanvänd inte direkt.
- #239: HOLD — dokumentarkiv paginering/filter måste reconcileras mot current main.
- #218: FROZEN HISTORICAL STACK.
- #223: HOLD — Prisma major.
- #191: HOLD — actions/checkout major.
- #222: HOLD — CodeQL major.
- #194: HOLD — separat react-dom dependency-task.
- #248/#249/#250: stängda som empty/superseded/duplicate.

## Leveransordning

1. **REV-SEARCH-001 — ACTIVE**
2. REV-DASH-ROLE-001 — Owner/Admin, Manager, Technician dashboards
3. REV-PROPERTY-001 — fastigheten som central arbetsyta
4. REV-ONBOARD-001 — first-run onboarding
5. REV-ROUTES-001 — canonical route-plan + redirects/tests
6. REV-E2E-001 — kritiska browser-E2E
7. REV-VERCEL-001 — autentiserad Vercel-audit när connector scope fungerar

REV-DEMO-001 återupptas så snart env-blockern är verifierbar; SEARCH får inte röra DEMO-filerna.

## Handoff / Definition of Done

Handoff ska dokumentera Task-ID, branch/HEAD SHA, exakt filscope, implementerat/återstående, tester, accessibility, security impact, database impact, PR och kända risker.

En task är DONE först när relevant lint, typecheck, tester, full quality gate, CI, CodeQL, exact-SHA Preview, browser smoke när åtkomst finns, accessibility/security/database impact, commit/PR/review/merge, Production deploy/smoke, runtime-loggkontroll och kvarvarande risker är redovisade.
