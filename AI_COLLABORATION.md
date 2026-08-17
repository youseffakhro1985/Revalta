# Revalta AI Collaboration Ledger

GitHub `main` är alltid den enda tekniska sanningskällan. Ingen agent får skriva i ett aktivt område som ägs av en annan agent utan explicit handoff.

## Grundregler

- En task = ett tydligt problemområde = en ägare = en branch = en PR.
- Läs aktuell `main` och notera exakt SHA före varje ny task och direkt före merge.
- Läs `AI_COLLABORATION.md`, `AGENTS.md`, `CLAUDE.md`, `DESIGN_SYSTEM.md`, `INTEGRATIONS.md` och relevanta docs innan produktkod ändras.
- Kontrollera öppna PR:er, issues, Preview/Production-status och Vercel där åtkomst finns.
- Gamla ChatGPT/Cursor/Claude-branches är **quarantine** tills de har jämförts mot aktuell `main`.
- En kvarvarande branch betyder inte att tasken fortfarande är aktiv.
- Tenant isolation är högsta säkerhetsinvarianten.
- Produktionsmigrationer går endast via dokumenterat Database Release-flöde.
- Inga secrets får skrivas i denna fil, PR-beskrivningar, screenshots eller loggar.
- Befintlig svensk/skandinavisk premiumdesign bevaras; koordinationsarbete får inte glida över i UI-redesign.
- Maskinläsbar task-status speglas i `docs/AI_TASKS.yml`.

## Verifierad snapshot

- Datum: `2026-08-17`
- Verifierad aktuell `main`: `ed4b4d1e38f354eb054f1233de12571312d1d290`
- Commit: `test: add exact-SHA Preview browser E2E`
- Production: `https://www.revalta.se`
- GitHub/Vercel Production deployment: `5941808630` — **SUCCESS**
- Vercel connector: **BLOCKED_CONNECTOR** — teamet är synligt men projektlistningen returnerar inga projekt. Full project/env/runtime-audit får därför inte påstås vara verifierad.
- Sprint: **P0 — koordinering, Vercel access, auth-reset, observability och demo**

> Snapshot-SHA är verifierad vid koordinationsstart. Läs alltid GitHub `main` igen före merge.

## Aktiv task

| Task-ID | Ägare | Branch | Status | Ägt område | Acceptance |
|---|---|---|---|---|---|
| REV-COORD-004 | ChatGPT Work | `agent/coord-004-task-registry` | **ACTIVE** | `AI_COLLABORATION.md`, `docs/AI_TASKS.yml` | Synka verklig status mot current main, ta bort gamla aktiva markeringar, skapa maskinläsbart register, inga runtime/UI/DB/dependencyändringar |

### REV-COORD-004 — förbjudna områden

- `src/**`
- `prisma/**`
- `.github/workflows/**`
- `package.json`
- `package-lock.json`
- demo-implementationens låsta filer
- all annan produktkod

## Blockerade / nästa P0-tasks

| Task-ID | Status | Källa | Nästa säkra steg |
|---|---|---|---|
| REV-VERCEL-002 | **BLOCKED_CONNECTOR** | Vercel team syns, `list_projects` returnerar inga projekt | Återställ verifierbar project access; därefter läs project/env/deploy/runtime utan att exponera secretvärden |
| REV-AUTH-RESET-001 | **READY_NEXT** | Issue #265 | Isolera latency i password-reset request, bevara anti-enumeration, lägg bounded regressionstest och återställ reset browser-E2E efter fix |
| REV-OBS-002 | **QUEUED** | Issue #217 | Färdigställ korrelerad observability för auth/cron/Stripe/kritiska API:er med requestId, latency och säkra eventkoder |
| REV-DEMO-001 | **BLOCKED_ENV — CODE GATE GREEN** | Draft PR #254 | Verifiera Vercel/env-status för `DEMO_REQUEST_TO`, smoke-testa submission på Preview, full gate, merge, Production smoke |

Ingen av de tre planerade P0-tasks ovan äger produktfiler förrän egen branch har skapats från då aktuell `main`. `REV-DEMO-001` behåller däremot sitt redan etablerade filägarskap eftersom PR #254 fortfarande är öppen och blockerad.

## Slutförda produkt- och plattformstasks

| Task-ID | Resultat | PR | Merge SHA | Verifierad status |
|---|---|---|---|---|
| REV-COORD-002 | Collaboration ledger + PR-triage | #251 | `b8138046087a7a93c6d346a58658f7bf006097dc` | CI/CodeQL/Preview/Production success |
| REV-NAV-001 | Navigation v2 + Settings/Admin IA | #252 | `354de1e0ba408525a4e47c2b6f16a038929e60f7` | Merged; full gate och Production verifierad |
| REV-BREAD-001 | Gemensamma breadcrumbs + lokal modulnavigation | #253 | `e24feff5f2e48c22b913b444b6c8ffd5cf82ee63` | Merged; full gate och Production verifierad |
| REV-COORD-003 | Handoff till Command Center och demo-blocker | #255 | `b7cad49965b3c5c714cea8cc907a2f9170eafc24` | Merged; CI/CodeQL/Preview success |
| REV-SEARCH-001 | GlobalSearch → Revalta Command Center | #256 | `a93f0fd050e88ba344f96e8d0685d4d3da26153a` | Merged; full gate verifierad |
| REV-DASH-ROLE-001 | Rollbaserade dashboards | #257 | `9147f3e88156d1eb1e6a59c1f70856cc4dba8183` | Merged; full gate verifierad |
| REV-PROPERTY-001 | Digital fastighetspärm/workspace | #258 | `d7d4d5624a16e4b6baf47b82b97fc4777d4d4d0d` | Merged; full gate verifierad |
| REV-ONBOARD-001 | Tenant-scopad 5-stegs first-run onboarding | #262 | `b9253cda99a79780477ef3b09150ba03c56338cd` | CI #990, CodeQL #282, exact-SHA Preview och Production success |
| REV-ROUTES-001 | Canonical dashboard route tree + legacy redirects | #263 | `a839728684984f8e5233093153972ec69e7e3f4d` | Merged; CI #992, CodeQL #284, exact-SHA Preview och Production success |
| REV-E2E-AUTH-001 | Exact-SHA Preview browser-E2E för register/login/navigation/Command Center/mobile/logout/protected route | #264 | `ed4b4d1e38f354eb054f1233de12571312d1d290` | CI #998, CodeQL #290, exact-SHA Preview + Browser E2E #5 success, Production success; password reset avsiktligt separerad som #265 |

## Aktiva fil-lås

### REV-COORD-004

- `AI_COLLABORATION.md`
- `docs/AI_TASKS.yml`

### REV-DEMO-001 — blockerad men fortfarande låst

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

## Öppna issues som påverkar releaseordningen

- **#265 — password-reset request stalls on Vercel Preview.** P0. Höj inte bara timeout; identifiera blockerande operation och bevara neutral anti-enumeration-respons.
- **#217 — Observability phase 2.** P0 efter auth-reset. Korrelera kritiska serverfel med requestId, route, method, release, environment, latency och stabil event/error code utan secrets/PII.

## PR-triage / HOLD

- #254 — DEMO: **draft / BLOCKED_ENV**, kodgate grön; merge förbjuden tills env + submission smoke är verifierbar.
- #239 — HOLD: dokumentarkiv paginering/filter måste reconcileras mot current main innan återanvändning.
- #218 — FROZEN HISTORICAL STACK: återanvänd inte direkt.
- #223 + #260 — HOLD: Prisma client/CLI major-upgrade måste hanteras som en koordinerad separat dependency-task.
- #191 — HOLD: actions/checkout major.
- #222 — HOLD: CodeQL major.
- #194 — HOLD: separat react-dom dependency-task.
- #259 + #261 — HOLD: tailwind-merge/Tailwind 4 är breaking dependency-spår och ska inte blandas med P0-produktarbete.

## Branch quarantine

Det finns många äldre `agent/*`, `cursor/*` och `claude/*` branches kvar. De är **inte aktiva bara för att de existerar**. Innan eventuell återanvändning krävs:

1. verifiera då aktuell `main`,
2. compare branch → current `main`,
3. kontrollera om motsvarande PR/task redan är merged/superseded,
4. isolera unik diff,
5. skapa explicit handoff innan någon fil skrivs.

`noop` är en inaktiv, oavsiktlig branch utan avsett unikt arbete och kan städas bort separat när branch-delete görs säkert.

## Leveransordning

1. **REV-COORD-004 — ACTIVE**
2. **REV-VERCEL-002 — verifierbar Vercel project access**
3. **REV-AUTH-RESET-001 — issue #265**
4. **REV-OBS-002 — issue #217**
5. **REV-DEMO-001 — återuppta befintlig PR #254 när env är verifierbar**
6. Därefter P1-produktarbete enligt aktuell roadmap, men endast efter ny current-main-reconciliation.

## Handoff / Definition of Done

En task är inte DONE bara för att kod eller dokument är skrivna. Relevant task ska redovisa baseline SHA, branch, changed files, implementation, tester/validering, lint/typecheck/full quality gate där relevant, security/tenant/accessibility/database impact, CI, CodeQL, exact-SHA Preview, relevant browser E2E/smoke, PR/review, compare mot current main, merge med förväntad HEAD, Production deploy/smoke, runtime-loggkontroll där åtkomst finns, kvarvarande risker och uppdaterat ledger/task-register.

Om en kontroll inte kan utföras ska status vara **BLOCKED**. Gissa aldrig att den är grön.
