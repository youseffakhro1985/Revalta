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
- Baseline `main` för aktiv task: `d7d4d5624a16e4b6baf47b82b97fc4777d4d4d0d`
- Commit: `feat: make property detail a digital property workspace`
- Production: `https://www.revalta.se`
- Sprint: **S0 — first-run onboarding och därefter canonical routes/E2E**
- Historiska Claude/Cursor-branches: HOLD tills explicit task + current-main compare.

> SHA-raden är task-baseline. Läs alltid GitHub `main` igen före merge.

## Aktiva / blockerade tasks

| Task-ID | Ägare | Branch | Status | Ägt område | Nästa grind |
|---|---|---|---|---|---|
| REV-ONBOARD-001 | ChatGPT | `agent/first-run-onboarding` | **IN PROGRESS** | onboarding progress helper/tests, `/api/onboarding`, dashboard first-run panel, dashboard root integration, ledger | 5-stegs owner/admin-onboarding med verkliga company/property/team/notifieringssignaler, audit-verifierad felanmälan, ingen ny datamodell; full CI/CodeQL/exact-SHA Preview |
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
| REV-DASH-ROLE-001 | Rollbaserade Owner/Admin, Manager, Technician och Viewer dashboards; Resident separat | #257 | `9147f3e88156d1eb1e6a59c1f70856cc4dba8183` | Full CI, CodeQL och exact-SHA Preview success |
| REV-PROPERTY-001 | Fastigheten som rollstyrd digital fastighetspärm med befintlig data | #258 | `d7d4d5624a16e4b6baf47b82b97fc4777d4d4d0d` | Full CI, CodeQL och exact-SHA Preview success |

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

### REV-ONBOARD-001 — aktivt låst

- `src/lib/onboarding.ts`
- `src/lib/onboarding.test.ts`
- `src/app/api/onboarding/**`
- `src/components/dashboard/first-run-onboarding.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `AI_COLLABORATION.md`

Ingen annan agent får ändra ovanstående filer innan explicit handoff.

## REV-ONBOARD-001 — beslutad implementation

1. **Företagsuppgifter** är klar först när organisationen har namn + organisationsnummer.
2. **Första fastigheten** är klar först när minst en icke-raderad Property finns för aktuell company.
3. **Bjud in team** är klar när organisationen har fler än en aktiv icke-resident-medlem eller en giltig väntande TeamInvite.
4. **Konfigurera felanmälan** använder ingen påhittad configmodell. Owner/Admin verifierar befintligt felanmälan/boendeportal-flöde efter att minst en fastighet finns; verifieringen lagras som immutable AuditLog-event `onboarding.ticket_intake_verified`.
5. **Notifieringsinställningar** är klar först när befintliga `ServiceNotificationSettings` faktiskt har sparats (`updatedAt` finns).

Progress räknas server-side från tenant-scopade signaler. Ingen localStorage används som affärssanning. Manager/Technician/Viewer/Resident får inte organisationens onboardingpanel.

## Säkerhet / data

- Ingen ny Prisma-modell, migration eller dependency.
- Onboarding-API använder aktuell `company_id` på samtliga queries.
- Endast owner/admin kan verifiera organisations-onboarding.
- Felanmälan kan inte markeras verifierad utan minst en verklig fastighet.
- AuditLog används för explicit verifieringsmilestone; ingen duplicerad affärsdata skapas.
- Dashboard visar onboarding endast när schema-readiness är grön.
- DEMO-filer rörs inte i onboarding-tasken.

## PR-triage / HOLD

- #254: DEMO — draft / BLOCKED_ENV, kodgate grön.
- #244: MERGED / historisk stor Claude-branch — återanvänd inte direkt.
- #239: HOLD — dokumentarkiv paginering/filter måste reconcileras mot current main.
- #218: FROZEN HISTORICAL STACK.
- #223: HOLD — Prisma major.
- #191: HOLD — actions/checkout major.
- #222: HOLD — CodeQL major.
- #194: HOLD — separat react-dom dependency-task.
- #248/#249/#250: stängda som empty/superseded/duplicate.

## Leveransordning

1. **REV-ONBOARD-001 — ACTIVE**
2. REV-ROUTES-001 — canonical route-plan + redirects/tests
3. REV-E2E-001 — kritiska browser-E2E
4. REV-VERCEL-001 — autentiserad Vercel-audit när connector scope fungerar

REV-DEMO-001 återupptas så snart env-blockern är verifierbar och får inte blandas med ovanstående tasks.

## Handoff / Definition of Done

Handoff ska dokumentera Task-ID, branch/HEAD SHA, exakt filscope, implementerat/återstående, tester, accessibility, security impact, database impact, PR och kända risker.

En task är DONE först när relevant lint, typecheck, tester, full quality gate, CI, CodeQL, exact-SHA Preview, browser smoke när åtkomst finns, accessibility/security/database impact, commit/PR/review/merge, Production deploy/smoke, runtime-loggkontroll och kvarvarande risker är redovisade.
