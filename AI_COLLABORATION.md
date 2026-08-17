# Revalta AI Collaboration Ledger

GitHub `main` är alltid den enda tekniska sanningskällan. Ingen agent får skriva i ett aktivt område som ägs av en annan agent utan explicit handoff.

## Grundregler

- En task = ett tydligt problemområde = en ägare = en branch = en PR.
- Läs aktuell `main` och notera exakt SHA före varje task och direkt före merge.
- Läs `AI_COLLABORATION.md`, `AGENTS.md`, `CLAUDE.md`, `DESIGN_SYSTEM.md`, `INTEGRATIONS.md` och relevanta docs före produktkod.
- Kontrollera öppna PR:er, issues, Preview/Production och Vercel där åtkomst finns.
- Gamla ChatGPT/Cursor/Claude-branches är **quarantine** tills compare mot aktuell `main` är gjort.
- Tenant isolation är högsta säkerhetsinvarianten.
- Produktionsmigrationer går endast via dokumenterat Database Release-flöde.
- Inga secrets eller personuppgifter får skrivas i ledger, PR-text eller tekniska loggar.
- Maskinläsbar task-status speglas i `docs/AI_TASKS.yml`.

## Verifierad snapshot

- Datum: `2026-08-17`
- Aktuell `main`: `68670b9378c49b4806eb33acc737da0719ae9ed1`
- Commit: `fix: bound password-reset request latency`
- Production: `https://www.revalta.se`
- Exact merge-SHA Production deployment: `5944102557` — **SUCCESS**
- Push CodeQL #307: **SUCCESS**
- Vercel connector: **BLOCKED_CONNECTOR** — teamet är synligt men projektlistan är tom; project/env/runtime/log-audit får inte påstås vara verifierad.
- Production Release Monitor/Uptime hade vid koordinationskontrollen ännu inte kört på nya SHA:n; direkt Production POST-reset och runtime-loggkontroll är därför **BLOCKED/ej självständigt verifierade**, inte gröna.
- Sprint: **P0 — registration latency → observability → demo; Vercel access fortsatt blockerad**

> Läs alltid GitHub `main` igen före nästa branch och före merge.

## Aktiv koordinering

| Task-ID | Ägare | Branch | Status | Scope |
|---|---|---|---|---|
| REV-COORD-005 | ChatGPT Work | `agent/coord-005-auth-handoff` | **ACTIVE** | Endast `AI_COLLABORATION.md`, `docs/AI_TASKS.yml` |

REV-COORD-005 synkar verklig post-merge-status. Ingen runtime-, UI-, API-, auth-, DB-, workflow- eller dependencykod får ändras.

## Nästa P0

| Task-ID | Status | Källa | Nästa säkra steg |
|---|---|---|---|
| REV-AUTH-REGISTER-001 | **READY_NEXT** | Issue #268 | Gör registreringsresponsen deterministiskt bounded utan falsk e-postsuccess eller borttagen verifieringssäkerhet. Instrumentera DB/provider/event-faser, lägg slow-provider regression och stabil exact-SHA browser-E2E. |
| REV-OBS-002 | **QUEUED** | Issue #217 | Färdigställ korrelerad observability över auth/cron/Stripe/kritiska API:er efter registreringslatensen. |
| REV-DEMO-001 | **BLOCKED_ENV — CODE GATE GREEN** | Draft PR #254 | Återuppta endast när `DEMO_REQUEST_TO` kan verifieras PRESENT/MISSING/MISCONFIGURED och Preview submission smoke kan köras. |
| REV-VERCEL-002 | **BLOCKED_CONNECTOR** | Vercel connector | Återställ verifierbar Revalta project access; läs därefter project/env/runtime utan att exponera secretvärden. |

Ingen planerad task ovan äger produktfiler innan egen branch skapats från då aktuell `main`. REV-DEMO-001 behåller sitt redan etablerade fil-lås.

## Ny auth-finding — issue #268

Registrerings-E2E visade intermittent latency efter att password-reset-fixen var grön:

- final auth-reset kandidat passerade reset med 2 600 ms på första Browser E2E-försöket, men `POST /api/auth/register` gav inget observerbart svar inom 20 s,
- kontrollerad retry på identisk SHA passerade reset på 157 ms och register 201 på 870 ms,
- tidigare cold Preview gav register 201 på 1 071 ms.

`src/app/api/auth/register/route.ts` väntar synkront på `queueEmailVerification(...)` före HTTP 201. Den helpern kan vänta på e-postprovider och därefter IntegrationEvent-persistens. Detta ska behandlas som separat P0; höj inte bara E2E-timeout och rapportera aldrig falsk delivery-success.

## Slutförda tasks

| Task-ID | Resultat | PR | Merge SHA | Verifiering |
|---|---|---|---|---|
| REV-COORD-002 | Collaboration ledger + PR-triage | #251 | `b8138046087a7a93c6d346a58658f7bf006097dc` | CI/CodeQL/Preview/Production success |
| REV-NAV-001 | Navigation v2 + Settings/Admin IA | #252 | `354de1e0ba408525a4e47c2b6f16a038929e60f7` | Full gate + Production |
| REV-BREAD-001 | Breadcrumbs + lokal modulnavigation | #253 | `e24feff5f2e48c22b913b444b6c8ffd5cf82ee63` | Full gate + Production |
| REV-COORD-003 | Command Center/demo handoff | #255 | `b7cad49965b3c5c714cea8cc907a2f9170eafc24` | CI/CodeQL/Preview success |
| REV-SEARCH-001 | Revalta Command Center | #256 | `a93f0fd050e88ba344f96e8d0685d4d3da26153a` | Full gate |
| REV-DASH-ROLE-001 | Rollbaserade dashboards | #257 | `9147f3e88156d1eb1e6a59c1f70856cc4dba8183` | Full gate |
| REV-PROPERTY-001 | Digital fastighetspärm | #258 | `d7d4d5624a16e4b6baf47b82b97fc4777d4d4d0d` | Full gate |
| REV-ONBOARD-001 | First-run onboarding | #262 | `b9253cda99a79780477ef3b09150ba03c56338cd` | CI #990, CodeQL #282, Preview, Production |
| REV-ROUTES-001 | Canonical dashboard routes | #263 | `a839728684984f8e5233093153972ec69e7e3f4d` | CI #992, CodeQL #284, Preview, Production |
| REV-E2E-AUTH-001 | Exact-SHA browser-E2E foundation | #264 | `ed4b4d1e38f354eb054f1233de12571312d1d290` | CI #998, CodeQL #290, Preview, E2E, Production |
| REV-COORD-004 | Synkad ledger + `docs/AI_TASKS.yml` | #266 | `5537f6a49d168cb3ed9b683668c6dbddad81b16d` | CI #1003, CodeQL #295, Preview/E2E, Production `5943445598` |
| REV-AUTH-RESET-001 | Bounded password-reset latency + query-shape soft-delete precheck + restored reset E2E | #267 | `68670b9378c49b4806eb33acc737da0719ae9ed1` | CI #1014, CodeQL #306, exact-SHA Preview `5944001258`, Browser E2E #21 success on identical-SHA retry; Production `5944102557` success; issue #265 CLOSED. Direct Production reset POST/runtime logs BLOCKED. |

## Aktiva fil-lås

### REV-COORD-005

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

## Issues / triage

- #265 — **CLOSED / COMPLETED** efter PR #267.
- #268 — **OPEN / P0 READY_NEXT**: registration response can stall while awaiting verification delivery.
- #217 — **OPEN / QUEUED**: observability phase 2.
- #254 — **draft / BLOCKED_ENV** demo.
- #239 — HOLD: dokumentarkiv måste reconcileras mot current main.
- #218 — FROZEN HISTORICAL STACK.
- #223 + #260 — HOLD: koordinerad Prisma major-task.
- #191 — HOLD: actions/checkout major.
- #222 — HOLD: CodeQL major.
- #194 — HOLD: react-dom dependency.
- #259 + #261 — HOLD: Tailwind breaking upgrades.

## Branch quarantine

Äldre `agent/*`, `cursor/*` och `claude/*` branches är inte aktiva bara för att de finns. Kräv current-main compare, merged/superseded-kontroll och explicit handoff före återanvändning. `noop` är fortsatt cleanup-kandidat utan avsett unikt arbete.

## Leveransordning

1. **REV-COORD-005 — ACTIVE**
2. **REV-AUTH-REGISTER-001 — issue #268**
3. **REV-OBS-002 — issue #217**
4. **REV-DEMO-001 — när Vercel/env kan verifieras**
5. **REV-VERCEL-002 — BLOCKED_CONNECTOR tills scope ändras**
6. Därefter P1 först efter ny current-main reconciliation.

## Definition of Done

En task är inte DONE bara för att kod finns. Redovisa relevant baseline SHA, branch, changed files, implementation, tester, lint/typecheck/full gate, security/tenant/accessibility/DB impact, CI, CodeQL, exact-SHA Preview, relevant browser E2E/smoke, PR/review, compare mot current main, expected-HEAD merge, Production deploy/smoke, runtime-loggkontroll där åtkomst finns, kvarvarande risker och uppdaterat ledger/task-register.

Kan en kontroll inte utföras ska status vara **BLOCKED**. Gissa aldrig grönt.
