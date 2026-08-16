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

## Aktuell snapshot

- Snapshotdatum: `2026-08-17`
- `main` vid start av aktiv task: `e24feff5f2e48c22b913b444b6c8ffd5cf82ee63`
- Commit: `feat: shared dashboard breadcrumbs and module navigation`
- Production: `https://www.revalta.se`
- Sprint: **S0 — IA, navigation, breadcrumbs och conversion path**
- Historiska Claude/Cursor-branches: HOLD tills explicit task + current-main compare.

> SHA-raden är task-baseline. Kontrollera alltid GitHub `main` igen före merge.

## Aktiva tasks

| Task-ID | Ansvarig | Branch | Ägda filer/moduler | Status | Acceptance criteria | PR / verifiering |
|---|---|---|---|---|---|---|
| REV-DEMO-001 | ChatGPT / Lead Product Engineer | `agent/demo-conversion-flow` | `/demo`, `/api/demo-request`, demo mail/form/tests, `src/app/page.tsx`, `marketing-header.tsx`, `site-footer.tsx`, `sitemap.ts`, `INTEGRATIONS.md`, ledger | IN PROGRESS | Boka demo → `/demo`; Skapa konto → `/register`; fungerande säker demoform; ingen falsk social proof; same-origin/body-limit/rate-limit/honeypot; serverbestämd mottagare; a11y; CI/CodeQL/Preview | TBD. `DEMO_REQUEST_TO` måste vara konfigurerad för liveleverans. |
| REV-244-AUDIT | ChatGPT | read-only | Historisk PR #244 + current-main risk comparison | LOW PRIORITY / READ-ONLY | Endast isolerade follow-ups om verifierad risk återstår | #244 MERGED |
| REV-VERCEL-001 | ChatGPT | read-only | Vercel project/env/runtime | BLOCKED | Autentiserad domain/branch/Node/build/env/cron/errors/logs/cache/health-audit | GitHub exact-SHA deploy fungerar; Vercel connector exponerar fortfarande inte projektinställningar. |

## Slutförda tasks

| Task-ID | Resultat | PR | Merge SHA | Verifiering |
|---|---|---|---|---|
| REV-COORD-002 | Central collaboration ledger + PR-triage | #251 | `b8138046087a7a93c6d346a58658f7bf006097dc` | CI/CodeQL/Preview/Production success |
| REV-NAV-001 | Navigation v2 + Settings/Admin IA | #252 | `354de1e0ba408525a4e47c2b6f16a038929e60f7` | Full CI, CodeQL, exact-SHA Preview, Production deployment `5936152663` success. Owner explicit merge despite blockerad auth Preview browser-smoke. |
| REV-BREAD-001 | Gemensamma breadcrumbs + lokal modulnavigation; tenant-safe dynamiska AO-labels | #253 | `e24feff5f2e48c22b913b444b6c8ffd5cf82ee63` | Full CI, 135 testfiler/783 tester, typecheck, dependency audit, production build, CodeQL, exact-SHA Preview, Production deployment `5936223118` success. |

## REV-DEMO-001 — aktivt filägarskap

Parallella writes är förbjudna i följande område tills explicit handoff:

- `src/app/demo/**`
- `src/app/api/demo-request/**`
- `src/lib/demo-request-email.ts`
- `src/lib/demo-request-email.test.ts`
- `src/components/demo-request-form.tsx`
- `src/app/page.tsx`
- `src/components/marketing-header.tsx`
- `src/components/site-footer.tsx`
- `src/app/sitemap.ts`
- `INTEGRATIONS.md`
- `AI_COLLABORATION.md`

### Implementerat hittills

- Ny `/demo`-sida i befintlig premiumdesign, utan påhittade kunder/logos/statistik.
- Startsidan skiljer `Boka demo` från `Skapa konto`; dashboard-preview/animation lämnas orörd.
- Marketing header och footer länkar till `/demo`; konto fortsätter till `/register`.
- `/api/demo-request`: same-origin mutation guard, body-limit, validering, persistent IP/identity rate-limit, honeypot, no-store och fail-closed mail delivery.
- Resend-leverans med HTML-escape, serverbestämd `DEMO_REQUEST_TO` och användarens e-post endast som reply-to.
- API- och mailtester täcker leverans, recipient isolation, HTML-escape, cross-site, invalid input, honeypot, rate-limit och missing configuration.
- `DEMO_REQUEST_TO` dokumenterad i `INTEGRATIONS.md`; variabelns värde får aldrig loggas eller exponeras.

## PR-triage / HOLD

| PR | Område | Status |
|---|---|---|
| #244 | stor historisk Claude hardening/polish | MERGED / historisk; återanvänd inte branch |
| #239 | dokumentarkiv paginering/filter | HOLD — reconcile mot current main |
| #218 | tenant/resident/release hardening | FROZEN HISTORICAL STACK |
| #223 | Prisma 5 → 6 | HOLD — major dependency |
| #191 | actions/checkout major | HOLD — CI |
| #222 | CodeQL major | HOLD — CI/security |
| #194 | react-dom patch | HOLD — separat dependency-task |

Stängda som superseded/duplicate/empty: `#248`, `#249`, `#250`.

## Nästa leveransordning

1. **REV-DEMO-001 — ACTIVE**
2. REV-SEARCH-001 — bygg vidare på befintlig `GlobalSearch` till Command Center
3. REV-DASH-ROLE-001 — Owner/Admin, Manager, Technician dashboards
4. REV-PROPERTY-001 — fastigheten som central arbetsyta
5. REV-ONBOARD-001 — first-run onboarding
6. REV-ROUTES-001 — canonical route-plan + redirects/tests
7. REV-E2E-001 — kritiska browser-E2E
8. REV-VERCEL-001 — autentiserad Vercel audit när connector scope fungerar

## Handoff-protokoll

Dokumentera alltid Task-ID, branch/HEAD SHA, filscope, implementerat/återstående, tester, accessibility, security impact, database impact, PR, risker och raden `HANDOFF COMPLETE — next owner: <agent>`.

## Definition of Done

Tasken ska där relevant redovisa: branch, ändrade filer, motiv, lint, typecheck, tester, full quality gate, CI, CodeQL, exact-SHA Preview, browser smoke när åtkomst finns, accessibility, security/database impact, commit SHA, PR/review, merge SHA, Production deploy/smoke, runtime-loggkontroll och kvarvarande risker.
