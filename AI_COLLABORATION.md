# Revalta AI Collaboration Ledger

Detta dokument är den centrala samarbetsfilen för ChatGPT Work, Cursor och Claude.ai. GitHub `main` är alltid den enda tekniska sanningskällan.

## Grundregler

- Ingen agent får börja skriva i ett aktivt område som ägs av en annan agent utan explicit handoff.
- En task = ett tydligt problemområde = en branch = en PR.
- Kontrollera aktuell `main` SHA omedelbart före branch-skapande och omedelbart före merge.
- Ändra aldrig kod utifrån en gammal branch utan att jämföra den mot aktuell `main`.
- Stora historiska branches eller PR:er får aldrig mergas blint.
- Produktkod ska gå via separat branch, verifiering, PR och review. Direktarbete på `main` ska undvikas.
- Tenant isolation är högsta säkerhetsinvarianten. Ändringar i auth, permissions, tenant reads/writes och resident/public routes kräver särskild säkerhetsgranskning.
- Produktionsmigrationer får bara köras via det dokumenterade Database Release-flödet.
- Produktionshemligheter får aldrig skrivas i denna fil, PR-beskrivningar, screenshots eller loggar.
- Revaltas befintliga svenska/skandinaviska premiumdesign ska bevaras. UX-arbete ska förbättra informationsarkitektur, navigation, läsbarhet och konsekvens utan nytt designspråk.

## Aktuell snapshot

- Snapshotdatum: `2026-08-16`
- Task-baseline main SHA: `b8138046087a7a93c6d346a58658f7bf006097dc`
- Main commit vid start av aktiv task: `docs: refresh AI collaboration ledger from current main`
- Production: `https://www.revalta.se`
- Pågående sprint: **S0 — post-merge stabilization, collaboration governance och UX-arkitektur**
- Öppna PR:er vid snapshot: `#191, #194, #218, #222, #223, #239`
- Claude-branches inventerade: 4
- Cursor-branches inventerade: 27

> SHA-raden är en verifierad task-baseline. En fil kan inte självreferera den commit-SHA som skapas när samma fil mergas; kontrollera därför alltid GitHub `main` direkt före nya writes och merge.

## Aktiva tasks

| Task-ID | Ansvarig | Branch / källa | Ägda filer/moduler | Status | Beroenden | Acceptance criteria | PR | Verifiering |
|---|---|---|---|---|---|---|---|---|
| REV-NAV-001 | ChatGPT / Lead Product Engineer | `agent/navigation-v2` | `src/components/dashboard/dashboard-shell.tsx`, `src/components/dashboard/dashboard-navigation.ts`, navigationstest, `src/app/(dashboard)/dashboard/installningar/layout.tsx`, ledger | IN PROGRESS | Baseline `b8138046…`; ingen parallell write i dessa filer | 2 primära länkar + 5 rollfiltrerade modulområden + Settings/Admin; högst ett område öppet; resident separat; desktop/mobile/a11y; inga route/data/auth-regressioner | TBD | Unit + full CI + CodeQL + Vercel Preview + browser smoke krävs före merge |
| REV-244-AUDIT | ChatGPT / Lead Product Engineer | Read-only audit av mergad PR #244 | PR #244 diff; security; migrations; dependencies; release; UI | IN PROGRESS | Ingen ny bred hardening-branch | Klassificera faktisk påverkan, regressionsrisker och isolerade follow-up tasks | #244 MERGED | GitHub diff/file audit + jämförelse mot current main |
| REV-VERCEL-001 | ChatGPT / Lead Product Engineer | Read-only | Vercel project/deploy/env/runtime | BLOCKED | Vercel connector måste exponera projektet | Domain/branch/Node/build/env/cron/errors/5xx/duration/logs/cache/health verifieras autentiserat; secrets endast PRESENT/MISSING/MISCONFIGURED | — | GitHub exact-SHA Vercel deployments verifierbara; projektinställningar/loggar ej åtkomliga via connector |

## Slutförda tasks

| Task-ID | Resultat | PR | Merge SHA | Verifiering |
|---|---|---|---|---|
| REV-COORD-002 | Central collaboration ledger etablerad från dåvarande current main; stale/duplicate/empty PR:er städade | #251 | `b8138046087a7a93c6d346a58658f7bf006097dc` | Revalta CI, CodeQL, Vercel Preview och Production deployment `success` |

## PR-triage och holds

| PR | Område | Status | Regel / nästa steg |
|---|---|---|---|
| #244 | `claude/revalta-hardening-polish` | MERGED 2026-08-16 | 39 commits / 224 filer. Historisk branch återanvänds inte. Post-merge audit pågår; follow-ups ska vara små separata PR:er. |
| #249 | AI collaboration ledger | CLOSED / SUPERSEDED | Ersatt av #251 från verifierad current main. |
| #250 | Dubblett-auth cleanup | CLOSED / DUPLICATE | De två felplacerade auth-filerna var redan borttagna i senare main-commits. |
| #248 | `team-hantering` / upload | CLOSED / EMPTY | 0 changed files; inget att merga. |
| #239 | Dokumentarkivets paginering/filter | HOLD — REBASE/REVIEW REQUIRED | Reconcile mot current main och dokument-API innan eventuell återimplementering i liten PR. |
| #218 | Tenant/resident/release hardening | FROZEN HISTORICAL STACK | Ingen blind merge. Endast isolerade delar får återanvändas efter current-main diff + säkerhetsgranskning. |
| #223 | Prisma 5 → 6 | HOLD — MAJOR DEPENDENCY | Arkitekturen är fortsatt Prisma 5. Kräver separat kompatibilitets-/migrationstest och full releasegrind. |
| #191 | `actions/checkout` major bump | HOLD — CI MAINTENANCE | #244 pinade nuvarande action till full commit SHA. Reconcile workflow-strategin först. |
| #222 | CodeQL major bump | HOLD — CI/SECURITY MAINTENANCE | Validera aktuell CodeQL-workflow och runner-kompatibilitet separat. |
| #194 | `react-dom` patch | HOLD — DEPENDENCY MAINTENANCE | Bedöms senare i egen dependency-PR efter current package/CI check. |

## Agent-branch quarantine

Historiska Claude- och Cursor-branches är **inte aktiva bara för att de finns**. De får inte återanvändas för nya writes förrän de har jämförts mot aktuell `main` och fått explicit task-ägare.

### Claude

- `claude/fix-role-checks`
- `claude/revalta-hardening-polish`
- `claude/startsida-fixes`
- `claude/ux-fixes`

### Cursor

Alla 27 inventerade `cursor/*-6157` branches är `HOLD` tills de kopplats till en uttrycklig task och current-main compare. Särskilt känsliga historiska områden är tenant isolation, resident portal, auth/hardening, schema mirrors, work-order permissions och production hardening.

## Verifierade current-state findings

- PR #244 är redan mergad; den kan inte längre delas upp före merge. Metoden är post-merge audit + små follow-up PR:er.
- #244 ändrade Node pin 22.x → 24.x och lade till tre additiva list-query-index för Property, Ticket och Lease; ingen destruktiv schemaändring identifierades i dessa migrationsfiler.
- Granskade billing-routes failar stängt i production om Stripe inte är korrekt konfigurerad.
- Granskade sök-, fastighets- och publika ärenderouter bytte huvudsakligen till strukturerad logging utan ny tenant-bypass i #244-diffen.
- AI-anrop fick 15 s timeout; återkommande eskaleringar fick transaktions-/dedupe-skydd; serviceeskaleringar hanterar samtidiga P2002-konflikter utan att fälla hela batchen.
- Current main ligger många commits efter #244 merge; historiska branches får därför inte användas som patchkälla utan compare.
- Legacy `/dashboard/arbetsordrar...` är rena redirects till canonical `/dashboard/arbetsorder...`, men `src/app/dashboard/installningar/eskaleringar` innehåller fortsatt en full aktiv UI-route. Route-migrering måste därför vara selektiv och testad.
- Publika startsidans `Boka demo` / `Boka en visning` leder fortfarande till `/register`; separat REV-DEMO-001 krävs.
- GitHub verifierar exact-SHA Vercel Preview/Production deployments, men autentiserad Vercel project/env/runtime-audit är fortsatt blockerad av connector-scope.

## Navigation v2 — aktiv informationsarkitektur

REV-NAV-001 implementerar följande utan redesign:

1. **Översikt**
2. **Fastigheter**
3. **Drift** — Ärenden, Arbetsordrar, Planering, Återkommande, Ronder, Besiktningar, Underhåll, Skador & försäkring
4. **Boende & uthyrning** — Boendeportal, Uthyrning, Hyresavisering, Bokningar, Nycklar & passage
5. **Ekonomi & analys** — Budget & prognos, Offerter, Energi, Mätare & IMD, Rapporter
6. **Dokument & projekt** — Dokument, Projekt
7. **Organisation** — Team, Leverantörer, Behörigheter, Integrationer

Administrativa verktyg flyttas ur den permanenta vänsternavigationen och exponeras rollstyrt i Settings/Admin: Händelselogg, Driftstatus, Redigeringslås, Abonnemang, Notisinställningar och företagsinställningar.

## Planerad leveransordning efter REV-NAV-001

Dessa tasks reserverar inte filer förrän status ändras till `IN PROGRESS`.

| Prioritet | Task-ID | Föreslagen ägare | Föreslagen branch | Scope | Acceptance criteria |
|---|---|---|---|---|---|
| P0 | REV-BREAD-001 | separat agent efter NAV handoff | TBD | Gemensam breadcrumb + lokal modulnavigation | Ett återanvändbart komponentmönster; inga route-specifika engångslösningar |
| P0 | REV-DEMO-001 | separat från NAV | `agent/demo-conversion-flow` | `/demo` och CTA-routing | Boka demo/visning → `/demo`; Skapa konto → `/register`; ingen falsk social proof |
| P1 | REV-SEARCH-001 | efter NAV | TBD | Bygg vidare på befintlig `GlobalSearch` | Search + modulnavigation + quick actions + skapa ny + recents + favorites; ingen parallell search |
| P1 | REV-DASH-ROLE-001 | efter NAV | TBD | Owner/Admin, Manager, Technician | Rollspecifika arbetsytor utan dataduplicering; resident fortsatt separat |
| P1 | REV-PROPERTY-001 | efter dashboard/nav stabilitet | TBD | Fastigheten som central arbetsyta | Digital fastighetspärm med befintlig modell och komponenter |
| P1 | REV-ONBOARD-001 | separat | TBD | Ny organisations onboarding | 5 steg, progress, tydliga tomlägen, tenant/role-safe |
| P1 | REV-ROUTES-001 | read-only först | TBD | `(dashboard)/dashboard` vs `app/dashboard` | Canonical plan + redirects + tests före borttagning |
| P1 | REV-E2E-001 | efter IA-stabilitet | TBD | Browser-E2E | register/login/logout/reset/company isolation/property/ticket/work order/resident/nav/mobile/search mot Preview |
| P1 | REV-VERCEL-001 | ChatGPT | read-only | Autentiserad Vercel-audit | Domain/branch/Node/build/env/cron/errors/5xx/duration/logs/cache/health verifierat |

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
10. PR-nummer/länk om sådan finns
11. kända risker
12. explicit rad: `HANDOFF COMPLETE — next owner: <agent>`

## Definition of Done

En task får markeras `DONE` först när följande kan redovisas där relevant:

- Task-ID
- branch
- ändrade filer
- varför ändringen behövdes
- lint
- typecheck
- relevanta tester
- full `npm run quality` när relevant
- CI-resultat
- Vercel Preview-resultat
- browser smoke
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
