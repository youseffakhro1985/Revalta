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
- Main SHA: `1eeafd50b85dd9b11cb4f9486229e2fe36a2f7d3`
- Main commit: `Spärra direkt planbyte i produktion`
- Production: `https://www.revalta.se`
- Pågående sprint: **S0 — post-merge stabilization, collaboration governance och UX-arkitektur**
- Öppna PR:er vid snapshot: `#191, #194, #218, #222, #223, #239, #248, #249, #250`
- Claude-branches inventerade: 4
- Cursor-branches inventerade: 27

## Aktiva tasks

| Task-ID | Ansvarig | Branch / källa | Ägda filer/moduler | Status | Beroenden | Acceptance criteria | PR | Verifiering |
|---|---|---|---|---|---|---|---|---|
| REV-COORD-002 | ChatGPT / Lead Product Engineer | `agent/coordination-ledger-current-main` | `AI_COLLABORATION.md` | IN PROGRESS | Main SHA ovan | Central ledger baserad på aktuell main; stale/aktiva arbeten synliga; inga produktkodändringar | TBD | Diff ska endast innehålla denna fil |
| REV-244-AUDIT | ChatGPT / Lead Product Engineer | Read-only audit av mergad PR #244 | PR #244 diff; security; migrations; dependencies; release; UI | IN PROGRESS | Ingen write i berörda områden under audit | Klassificera vad #244 faktiskt förde in, vad som är relevant efter merge, regressionsrisker och små follow-up tasks | #244 MERGED | GitHub diff/file audit + current-main comparison |
| REV-VERCEL-001 | ChatGPT / Lead Product Engineer | Read-only | Vercel project/deploy/env/runtime | BLOCKED | Vercel connector måste exponera projektet | Production branch/domain/Node/build/env/logs verifieras autentiserat; secrets rapporteras endast PRESENT/MISSING/MISCONFIGURED | — | GitHub visar Vercel success för current main, men Vercel connector listar inget projekt |

## PR-triage och holds

| PR | Område | Status | Regel / nästa steg |
|---|---|---|---|
| #244 | `claude/revalta-hardening-polish` | MERGED 2026-08-16 | 39 commits / 224 filer. Får inte användas som aktiv arbetsbranch. Post-merge audit pågår och follow-ups ska bli små separata PR:er. |
| #249 | AI collaboration ledger | SUPERSEDED / CLOSE CANDIDATE | Branch ligger efter aktuell main. Ersätts av `REV-COORD-002` från current main. |
| #250 | Dubblett-auth cleanup | DUPLICATE / CLOSE CANDIDATE | De två felplacerade auth-filerna är redan borttagna i senare commits på main. Mergas inte. |
| #248 | `team-hantering` / upload | EMPTY / CLOSE CANDIDATE | PR rapporterar 0 changed files. Mergas inte. |
| #239 | Dokumentarkivets paginering/filter | HOLD — REBASE/REVIEW REQUIRED | Reconcile mot current main och dokument-API innan eventuell återimplementering i liten PR. |
| #218 | Tenant/resident/release hardening | FROZEN HISTORICAL STACK | Ingen blind merge. Endast isolerade delar får återanvändas efter current-main diff + säkerhetsgranskning. |
| #223 | Prisma 5 → 6 | HOLD — MAJOR DEPENDENCY | Nuvarande arkitekturdokument anger Prisma 5. Kräver separat kompatibilitets-/migrationstest och full releasegrind. |
| #191 | `actions/checkout` major bump | HOLD — CI MAINTENANCE | PR #244 pinade nuvarande actions till commit SHA. Reconcile workflow-strategin först. |
| #222 | CodeQL major bump | HOLD — CI/SECURITY MAINTENANCE | Validera aktuell CodeQL-workflow och GitHub runner-kompatibilitet separat. |
| #194 | `react-dom` patch | HOLD — DEPENDENCY MAINTENANCE | Kan bedömas senare i egen dependency-PR efter current package/CI check. |

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

- PR #244 är redan mergad; den kan inte längre delas upp före merge. Åtgärdsmetoden är post-merge audit + små follow-up PR:er.
- PR #244 ändrade Node pin från 22.x till 24.x.
- PR #244 lade till tre additiva Prisma-index för Property, Ticket och Lease; ingen destruktiv schemaändring identifierades i dessa filer.
- PR #244:s granskade `dashboard-shell`- och `GlobalSearch`-diffar var huvudsakligen kontrast/accessibility-polish och skapade inte Navigation v2 eller Command Center.
- Nuvarande vänsternavigation i `main` är fortfarande platt och visar många destinationer inom tre stora grupper. Navigation v2 är därför fortfarande ett eget arbete.
- Publika startsidan visar `Boka demo` / `Boka en visning`, och den nuvarande CTA:n leder fortfarande till `/register`. Detta bryter mot den nya konverteringsregeln och ska fixas i en separat liten task.
- GitHub visar Vercel-status `success` för current main. Det bevisar deployment-status men inte att Vercel project settings, secrets eller runtime-loggar är korrekt verifierade.

## Planerad leveransordning

Dessa tasks reserverar inte filer förrän status ändras till `IN PROGRESS`.

| Prioritet | Task-ID | Föreslagen ägare | Föreslagen branch | Scope | Acceptance criteria |
|---|---|---|---|---|---|
| P0 | REV-244-AUDIT | ChatGPT | read-only | Slutför post-merge audit | Riskregister + isolerade follow-up tasks; inga svepande ändringar |
| P0 | REV-NAV-001 | Cursor efter explicit handoff | `cursor/navigation-v2` | Informationsarkitektur + vänsternavigation | Ca 7 huvudområden, undernavigation vid behov, rollstyrning bevarad, desktop/mobile/accessibility testad |
| P0 | REV-BREAD-001 | Cursor efter NAV handoff | `cursor/breadcrumbs-system` | Gemensam breadcrumb + lokal modulnavigation | Ett återanvändbart komponentmönster; inga route-specifika engångslösningar |
| P0 | REV-DEMO-001 | ChatGPT eller Cursor, separat från NAV | `agent/demo-conversion-flow` | `/demo` och CTA-routing | Boka demo/visning → `/demo`; Skapa konto → `/register`; ingen falsk social proof |
| P1 | REV-SEARCH-001 | Cursor efter NAV | `cursor/command-center` | Bygg vidare på befintlig `GlobalSearch` | Search + modulnavigation + quick actions + skapa ny + recents + favorites; ingen parallell search |
| P1 | REV-DASH-ROLE-001 | Claude efter handoff | `claude/role-dashboard-audit` | Owner/Admin, Manager, Technician | Rollspecifika arbetsytor utan dataduplicering; resident fortsatt separat |
| P1 | REV-PROPERTY-001 | Cursor efter dashboard/nav stabilitet | `cursor/property-workspace` | Fastigheten som central arbetsyta | Digital fastighetspärm med befintlig modell och komponenter |
| P1 | REV-ONBOARD-001 | Claude separat | `claude/first-run-onboarding` | Ny organisations onboarding | 5 steg, progress, tydliga tomlägen, tenant/role-safe |
| P1 | REV-ROUTES-001 | ChatGPT read-only först | TBD | `(dashboard)/dashboard` vs `app/dashboard` | Canonical plan + redirects + tests före borttagning |
| P1 | REV-E2E-001 | Cursor efter IA-stabilitet | `cursor/e2e-critical-flows` | Browser-E2E | register/login/logout/reset/company isolation/property/ticket/work order/resident/nav/mobile/search mot Preview |
| P1 | REV-VERCEL-001 | ChatGPT | read-only | Autentiserad Vercel-audit | Domain/branch/Node/build/env/cron/errors/5xx/duration/logs/cache/health verifierat |

## Navigation v2 — beslutad informationsarkitektur

När `REV-NAV-001` aktiveras ska den bygga mot följande mål utan redesign:

1. **Översikt**
2. **Fastigheter**
3. **Drift** — Ärenden, Arbetsordrar, Planering, Återkommande, Ronder, Besiktningar, Underhåll, Skador & försäkring
4. **Boende & uthyrning** — Boendeportal, Uthyrning, Hyresavisering, Bokningar, Nycklar & passage
5. **Ekonomi & analys** — Budget & prognos, Offerter, Energi, Mätare & IMD, Rapporter
6. **Dokument & projekt** — Dokument, Projekt
7. **Organisation** — Team, Leverantörer, Behörigheter, Integrationer

Flytta administrativa verktyg till Settings/Admin: Händelselogg, Driftstatus, Redigeringslås, Abonnemang, Notisinställningar och företagsinställningar.

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
