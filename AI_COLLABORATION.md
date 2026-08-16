# Revalta AI Collaboration Ledger

Detta dokument är den centrala samarbetsfilen för ChatGPT Work, Cursor och Claude.ai. GitHub `main` är alltid den enda tekniska sanningskällan.

## Grundregler

- Ingen agent får skriva i ett aktivt område som ägs av en annan agent utan explicit handoff.
- En task = ett tydligt problemområde = en branch = en PR.
- Kontrollera aktuell `main` SHA direkt före branch-skapande och direkt före merge.
- Gamla Claude/Cursor-branches är aldrig teknisk sanning och får inte återanvändas utan compare mot aktuell `main`.
- Tenant isolation är högsta säkerhetsinvarianten.
- Produktionsmigrationer går endast via dokumenterat Database Release-flöde.
- Inga secrets får skrivas i denna fil, PR-beskrivningar, screenshots eller loggar.
- Befintlig svensk/skandinavisk premiumdesign bevaras. Ingen agent får introducera ett nytt designspråk.

## Aktuell snapshot

- Snapshotdatum: `2026-08-17`
- Current `main` vid start av aktiv task: `354de1e0ba408525a4e47c2b6f16a038929e60f7`
- Current main commit: `feat: navigation v2 information architecture`
- Production: `https://www.revalta.se`
- Sprint: **S0 — IA, navigation, breadcrumbs och conversion path**
- Claude-branches: historiska / HOLD tills compare
- Cursor-branches: historiska / HOLD tills compare

> SHA-raden är task-baseline. Filen kan inte självreferera SHA:n som skapas när filen själv commitas. Kontrollera därför alltid GitHub `main` före nästa write/merge.

## Aktiva tasks

| Task-ID | Ansvarig | Branch | Ägda filer/moduler | Status | Beroenden | Acceptance criteria | PR | Verifiering |
|---|---|---|---|---|---|---|---|---|
| REV-BREAD-001 | ChatGPT / Lead Product Engineer | `agent/breadcrumbs-system` | `src/components/dashboard/dashboard-breadcrumbs.tsx`, `src/components/dashboard/module-navigation.tsx`, `src/components/dashboard/module-navigation.test.ts`, fastighetsindex/-detalj, arbetsorder layouts, Settings layout, ledger | IN PROGRESS | Baseline main `354de1e0…`; ingen parallell write i dessa filer | Gemensamma semantiska breadcrumbs; dynamiska objektetiketter där data finns; en återanvändbar lokal modulnavigation; aktiv-state + keyboard/a11y; tenant-safe dynamiska breadcrumbs; inga route/data/schemaändringar | TBD | Unit + full CI + CodeQL + exact-SHA Preview krävs |
| REV-244-AUDIT | ChatGPT / Lead Product Engineer | read-only | Historisk PR #244 + post-merge current-main comparison | IN PROGRESS / LOW WRITE PRIORITY | Ingen ny stor hardening-branch | Endast isolerade follow-ups om verifierad risk återstår | #244 MERGED | File/diff audit |
| REV-VERCEL-001 | ChatGPT / Lead Product Engineer | read-only | Vercel project/env/runtime | BLOCKED | Connector måste exponera projektet | Domain/branch/Node/build/env/cron/errors/5xx/duration/logs/cache/health; secrets endast PRESENT/MISSING/MISCONFIGURED | — | GitHub exact-SHA deployments fungerar; autentiserade projektinställningar/loggar fortfarande blockerade |

## Slutförda tasks

| Task-ID | Resultat | PR | Merge SHA | Verifiering / risk |
|---|---|---|---|---|
| REV-COORD-002 | Central collaboration ledger och stale/duplicate/empty PR-triage | #251 | `b8138046087a7a93c6d346a58658f7bf006097dc` | CI, CodeQL, Preview och Production success |
| REV-NAV-001 | Navigation v2: 2 primära destinationer + fem rollfiltrerade modulområden + Settings/Admin; resident separat; desktop/mobile samma modell | #252 | `354de1e0ba408525a4e47c2b6f16a038929e60f7` | Full CI + CodeQL + exact-SHA Preview success. Authenticated Preview browser smoke var blockerad av Vercel access; repository owner gav explicit mergeinstruktion. Production deployment `5936152663` success. |

## REV-BREAD-001 — aktivt filägarskap

Följande område är låst för parallella writes tills explicit handoff:

- `src/components/dashboard/dashboard-breadcrumbs.tsx`
- `src/components/dashboard/module-navigation.tsx`
- `src/components/dashboard/module-navigation.test.ts`
- `src/app/(dashboard)/dashboard/installningar/layout.tsx`
- `src/app/(dashboard)/dashboard/arbetsorder/layout.tsx`
- `src/app/(dashboard)/dashboard/arbetsorder/[id]/layout.tsx`
- `src/app/(dashboard)/dashboard/fastigheter/page.tsx`
- `src/app/(dashboard)/dashboard/fastigheter/[id]/page.tsx`
- `AI_COLLABORATION.md`

### Implementerad riktning hittills

- Gemensam `DashboardBreadcrumbs` med semantisk `<nav>`, `aria-current`, keyboard focus, overflow/truncation och premiumtokens.
- Gemensam `ModuleNavigation` med aktiv route, `exact`-stöd och samma komponent för flera moduler.
- Settings använder nu gemensam lokal modulnavigation i stället för egen link styling.
- Arbetsordrar använder samma lokala modulnavigation för Arbetsordrar / Planering / Arbetsorderöversikt / Återkommande.
- Fastighetsregister visar `Fastigheter`; fastighetsdetalj visar `Fastigheter / <fastighetsnamn>`.
- Arbetsorderdetalj visar `Drift / Arbetsordrar / <AO-nummer>` när enterprise-numret finns, annars arbetsorderns titel.
- Arbetsorder-breadcrumb hämtas tenant-scopat och respekterar technician assigned-work scope innan etiketten visas.

## PR-triage / HOLD

| PR | Område | Status | Regel |
|---|---|---|---|
| #244 | stor Claude hardening/polish | MERGED / HISTORISK | Återanvänd aldrig branch direkt; endast små current-main follow-ups |
| #239 | dokumentarkiv paginering/filter | HOLD | Reconcile mot current main innan ny liten PR |
| #218 | tenant/resident/release hardening | FROZEN HISTORICAL STACK | Ingen blind merge |
| #223 | Prisma 5 → 6 | HOLD — MAJOR DEPENDENCY | Separat compatibility/migration gate |
| #191 | actions/checkout major | HOLD — CI | Reconcile mot pinned action-strategi |
| #222 | CodeQL major | HOLD — CI/SECURITY | Separat runner/workflow audit |
| #194 | react-dom patch | HOLD — DEPENDENCY | Egen liten dependency-PR senare |

Stängda som superseded/duplicate/empty: `#248`, `#249`, `#250`.

## Verifierade current-state findings

- PR #244 är redan mergad och följdes av många ytterligare commits; gamla agentbranches är därför högrisk som patchkälla.
- Node är pinad till 24.x i repo.
- #244:s granskade Prismaförändringar var additiva index, inte destruktiv datamodelländring.
- Billing failar stängt i production när Stripe-konfiguration saknas/felar.
- AI-anrop har timeout; återkommande/serviceeskaleringar har dedupe/concurrency-skydd.
- Legacy `/dashboard/arbetsordrar...` är redirects, men `src/app/dashboard/installningar/eskaleringar` är fortfarande aktiv full route. Route-cleanup måste vara selektiv.
- Publika startsidans demo-CTA kräver separat REV-DEMO-001.
- GitHub exact-SHA Preview/Production deploymentstatus är verifierbar. Autentiserad Vercel project/env/runtime-audit är fortfarande blockerad av connector scope.

## Leveransordning

| Prioritet | Task-ID | Scope | Startregel |
|---|---|---|---|
| P0 | REV-BREAD-001 | Breadcrumbs + gemensamma lokala modulmenyer | **ACTIVE** |
| P0 | REV-DEMO-001 | `/demo` + korrekt CTA-routing | Starta först efter BREAD merge/handoff |
| P1 | REV-SEARCH-001 | Utöka befintlig `GlobalSearch` till Command Center | Efter BREAD stabilitet |
| P1 | REV-DASH-ROLE-001 | Owner/Admin, Manager, Technician dashboards | Efter SEARCH/IA baseline |
| P1 | REV-PROPERTY-001 | Fastigheten som central arbetsyta | Efter nav/breadcrumb baseline |
| P1 | REV-ONBOARD-001 | 5-stegs first-run onboarding | Separat tenant-safe task |
| P1 | REV-ROUTES-001 | Canonical route-plan + redirects/tests | Read-only audit först |
| P1 | REV-E2E-001 | Browser-E2E för kritiska flöden | Efter IA stabilitet |
| P1 | REV-VERCEL-001 | Autentiserad Vercel audit | När connector scope fungerar |

## Handoff-protokoll

Innan nästa agent skriver i ett aktivt område ska föregående ägare dokumentera:

1. Task-ID
2. branch och full HEAD SHA
3. exakt fil-/modulscope
4. implementerat arbete
5. återstående arbete
6. tester och resultat
7. accessibility-status
8. security impact
9. database impact
10. PR-nummer
11. kända risker
12. `HANDOFF COMPLETE — next owner: <agent>`

## Definition of Done

En task markeras `DONE` först när följande redovisas där relevant:

- Task-ID
- branch
- ändrade filer
- varför ändringen behövdes
- lint
- typecheck
- relevanta tester
- full quality gate
- CI-resultat
- CodeQL
- exact-SHA Vercel Preview
- browser smoke när åtkomst finns
- accessibility
- security impact
- database impact
- commit SHA
- PR
- review
- merge SHA
- production deploy
- production smoke
- runtime-loggkontroll
- kvarvarande risker
