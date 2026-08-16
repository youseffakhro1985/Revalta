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
- Om en task blockeras externt får nästa icke-överlappande task aktiveras först när filägarskapet är dokumenterat här.

## Snapshot

- Datum: `2026-08-17`
- Baseline `main` för aktiv task: `a93f0fd050e88ba344f96e8d0685d4d3da26153a`
- Commit: `feat: evolve GlobalSearch into Revalta Command Center`
- Production: `https://www.revalta.se`
- Sprint: **S0 — rollbaserad arbetsyta och fastighetsworkspace**
- Historiska Claude/Cursor-branches: HOLD tills explicit task + current-main compare.

> SHA-raden är task-baseline. Läs alltid GitHub `main` igen före merge.

## Aktiva / blockerade tasks

| Task-ID | Ägare | Branch | Status | Ägt område | Nästa grind |
|---|---|---|---|---|---|
| REV-DASH-ROLE-001 | ChatGPT | `agent/role-dashboard` | **IN PROGRESS** | dashboard root, role router + Portfolio/Manager/Technician/Viewer components/tests, ledger | Rollspecifika arbetsytor utan ny datamodell; Resident fortsatt separat; tenant/assigned-work scope; schema readiness; full CI/CodeQL/exact-SHA Preview |
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
| REV-SEARCH-001 | Befintlig GlobalSearch utvecklad till Command Center; rollstyrda kommandon, modulnav, favorites/recents, work-order search | #256 | `a93f0fd050e88ba344f96e8d0685d4d3da26153a` | Full CI #981, CodeQL #272 och exact-SHA Preview `5936357068` success |

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

### REV-DASH-ROLE-001 — aktivt låst

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/components/dashboard/dashboard-role.ts`
- `src/components/dashboard/dashboard-role.test.ts`
- `src/components/dashboard/portfolio-dashboard.tsx`
- `src/components/dashboard/manager-dashboard.tsx`
- `src/components/dashboard/technician-dashboard.tsx`
- `src/components/dashboard/viewer-dashboard.tsx`
- `AI_COLLABORATION.md`

Command Center-filer är handoffade och får inte ändras i denna task.

## REV-DASH-ROLE-001 — implementerad riktning hittills

### Owner / Admin — Portföljöversikt
- verkligt tenant-scopat fastighets- och objektsantal
- kritiska avvikelser från akuta ärenden + försenade aktiva arbetsordrar
- aktuell årsbudget och utfall från befintlig `BudgetEntry`
- vakans härledd från objekt minus unika reserverade/aktiva/notice leases
- underhållsbehov till nästa år från befintlig `PortfolioMaintenanceItem`
- befintlig `DashboardSlaOperations`
- inget fabricerat health-score; läget visas endast från verkliga avvikelser

### Manager — Dagens förvaltning
- tenant-scopat bestånd i arbetsytan (ingen falsk individuell property-assignment eftersom modellen saknar manager-user FK)
- otilldelade ärenden
- försenade arbetsordrar
- kommande CalendarEvent från idag + 30 dagar
- aktiva leverantörsavtal och avtal med slutdatum inom 120 dagar
- otilldelad ärendekö och befintlig SLA-operationsvy

### Technician — Min dag
- strikt `company_id + assigned_to_id` för alla arbetsordrar
- verkligt totalantal aktiva egna AO + akutantal
- nästa uppdrag från schemalagd/aktiv AO
- dagens registrerade exekveringstid, materialposter och före/efter-bilder via befintliga execution/document-tabeller
- dagens avslutade egna arbetsordrar
- fältflöde länkar tillbaka till arbetsordern för tid, material, bilder och avslut
- raw SQL använder parameterisering + befintliga soft-delete guards; schema mismatch ger endast noll i fältsummeringen, aldrig cross-tenant fallback

### Viewer
- read-only bestånd, objekt, vakans och budget/utfall
- inga mutations-CTA:er i arbetsytan

### Gemensam dashboard-router
- Owner/Admin → portfolio
- Manager → manager
- Technician → technician
- Viewer/unknown → viewer
- Resident → befintlig boendeportal
- schema readiness + e-postverifieringsbanner bevaras
- om schema inte är redo körs inga nya rollqueries; en fail-closed kompatibilitetsvy visas tills Database Release är klar

## Verifierade findings

- Prisma `Unit` har inget `deleted_at`; nya rollvyer har korrigerats så de följer faktisk modell i stället för att anta soft-delete på Unit.
- Prisma `WorkOrder` har `company_id`, `assigned_to_id`, `scheduled_start`, `completion_due_at`, `sla_resolution_due_at`, `completed_at` och `work_order_number`.
- `WorkOrderExecutionEntry` och `OperationalDocument` är befintliga datakällor för teknikerns tid/material/bilder; ingen ny modell krävs.
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

1. **REV-DASH-ROLE-001 — ACTIVE**
2. REV-PROPERTY-001 — fastigheten som central arbetsyta
3. REV-ONBOARD-001 — first-run onboarding
4. REV-ROUTES-001 — canonical route-plan + redirects/tests
5. REV-E2E-001 — kritiska browser-E2E
6. REV-VERCEL-001 — autentiserad Vercel-audit när connector scope fungerar

REV-DEMO-001 återupptas så snart env-blockern är verifierbar; roll-dashboard får inte röra DEMO-filerna.

## Handoff / Definition of Done

Handoff ska dokumentera Task-ID, branch/HEAD SHA, exakt filscope, implementerat/återstående, tester, accessibility, security impact, database impact, PR och kända risker.

En task är DONE först när relevant lint, typecheck, tester, full quality gate, CI, CodeQL, exact-SHA Preview, browser smoke när åtkomst finns, accessibility/security/database impact, commit/PR/review/merge, Production deploy/smoke, runtime-loggkontroll och kvarvarande risker är redovisade.
