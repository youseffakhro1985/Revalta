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
- Befintlig svensk/skandinavisk premiumdesign bevaras.
- Maskinläsbar task-status speglas i `docs/AI_TASKS.yml`.

## Verifierad snapshot

- Datum: `2026-08-17`
- Aktuell task-baseline `main`: `5537f6a49d168cb3ed9b683668c6dbddad81b16d`
- Baseline commit: `docs: synchronize AI collaboration truth and task registry`
- Production: `https://www.revalta.se`
- Baseline Production deployment: `5943445598` — **SUCCESS**
- Vercel connector: **BLOCKED_CONNECTOR** — teamet är synligt men projektlistningen returnerar inga projekt. Full project/env/runtime-audit får inte påstås vara verifierad.
- Sprint: **P0 — auth-reset, observability och demo; Vercel access fortsatt blockerad**

> Snapshot-SHA är task-baseline. Läs alltid GitHub `main` igen före nästa task och direkt före merge.

## Aktiv task

| Task-ID | Ägare | Branch | PR | Status | Nästa grind |
|---|---|---|---|---|---|
| REV-AUTH-RESET-001 | ChatGPT Work | `agent/auth-reset-bounded-latency` | #267 | **FINAL EXACT-SHA GATE** | Frys kandidat → CI/CodeQL → exact-SHA Preview → cold browser E2E med reset <8s → review/compare → merge → Production |

### REV-AUTH-RESET-001 — verifierad rotorsak och fix

Issue #265 visade att `POST /api/auth/password-reset/request` kunde sakna browser-observerbart svar efter 25 sekunder även för en okänd e-postadress. Felsökningen visade två onödiga latencyytor före e-poststeget:

1. den persistenta rate-limitern använder en interactive Prisma transaction men saknade explicit `maxWait`/`timeout`, och
2. Revaltas globala soft-delete-kompatibilitet körde en `information_schema`-inspektion för Prisma-queries även när queryn inte kunde beröra någon soft-delete-modell, exempelvis enkel `User → Company`, `RateLimitAttempt` och token-infrastruktur.

Fixen:

- behåller PostgreSQL/advisory-lock-baserad persistent limiter som primär källa,
- sätter `maxWait: 1500ms` och `timeout: 2500ms` på limiter-transactionen,
- behåller befintlig process-memory fallback endast när persistent limiter fallerar,
- gör soft-delete-kompatibilitet query-shape-aware: schema-inspektion sker endast om rootmodellen är en soft-delete-modell, `deleted_at` faktiskt förekommer i query-args eller vald/inkluderad relationsväg når en soft-delete-modell,
- låter enkla `User → Company`, rate-limit- och tokenqueries gå direkt utan onödig schema-inspektion,
- bevarar soft-delete-skydd för exempelvis `Property`, `Ticket`, `WorkOrder` och nested relationer till sådana modeller,
- lägger säkra faslatencies för rate limit, lookup, token, delivery och total request,
- loggar inte e-post, IP, reset-token, request body, secrets eller råa DB-fel i limiter-fallbacken,
- återställer browser-E2E för okänd reset-adress med neutral HTTP 200/text och hård 8-sekundersgräns.

### Preview-bevis före slutkandidaten

På cold exact-SHA Preview för kandidat `b98eace85b322613a933a8c68064f2b1e026c80c`:

- password reset för okänd adress: **neutral 200 på 736 ms**,
- register API: **HTTP 201 på 1 071 ms**,
- resterande browserfail berodde enbart på en felaktig testassertion: login-sidans riktiga rubrik är `Välkommen tillbaka`, inte `Logga in`.

Dessa värden är diagnostiskt bevis, men final release kräver att **den slutliga oförändrade kandidat-SHA:n** kör hela grinden igen.

### REV-AUTH-RESET-001 — owned paths

- `src/app/api/auth/password-reset/request/route.ts`
- `src/app/api/auth/password-reset/request/route.test.ts`
- `src/lib/rate-limit.ts`
- `src/lib/rate-limit.test.ts`
- `src/lib/db.ts` — endast query-shape-beslut för soft-delete compatibility
- `src/lib/db.test.ts`
- `e2e/auth-navigation.mjs`
- `AI_COLLABORATION.md`
- `docs/AI_TASKS.yml`

### REV-AUTH-RESET-001 — forbidden paths

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
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `package.json`
- `package-lock.json`
- `.github/workflows/**`
- övrig auth/session/login-kod

Databasimpact: **ingen schema/migration**. Säkerhetsimpact: anti-enumeration oförändrad; rate-limit-kontrakt och limittal oförändrade; DB-limiter fortsatt primär; soft-delete-skyddet behålls för berörda modeller/relationsvägar.

## Blockerade / nästa P0-tasks

| Task-ID | Status | Källa | Nästa säkra steg |
|---|---|---|---|
| REV-VERCEL-002 | **BLOCKED_CONNECTOR** | Vercel team syns, `list_projects` returnerar inga projekt | Återställ verifierbar project access; därefter läs project/env/deploy/runtime utan att exponera secretvärden |
| REV-OBS-002 | **QUEUED** | Issue #217 | Färdigställ korrelerad observability efter auth-reset; återanvänd nya säkra latency-event där relevant |
| REV-DEMO-001 | **BLOCKED_ENV — CODE GATE GREEN** | Draft PR #254 | Verifiera Vercel/env-status för `DEMO_REQUEST_TO`, smoke-testa submission på Preview, full gate, merge, Production smoke |

`REV-DEMO-001` behåller sitt etablerade filägarskap. Inget auth-reset-arbete får röra demo-scope.

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
| REV-ROUTES-001 | Canonical dashboard route tree + legacy redirects | #263 | `a839728684984f8e5233093153972ec69e7e3f4d` | CI #992, CodeQL #284, exact-SHA Preview och Production success |
| REV-E2E-AUTH-001 | Exact-SHA browser-E2E foundation | #264 | `ed4b4d1e38f354eb054f1233de12571312d1d290` | CI #998, CodeQL #290, exact-SHA Preview + Browser E2E #5 + Production success; password reset separerad som #265 |
| REV-COORD-004 | Synkad multi-agent truth + `docs/AI_TASKS.yml` | #266 | `5537f6a49d168cb3ed9b683668c6dbddad81b16d` | CI #1003, CodeQL #295, exact-SHA Preview + Browser E2E retry success, Production `5943445598` success |

## Aktiva fil-lås

### REV-AUTH-RESET-001

Se owned/forbidden paths ovan.

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

- **#265 — password-reset request stalls on Vercel Preview.** **ACTIVE via REV-AUTH-RESET-001 / PR #267.**
- **#217 — Observability phase 2.** P0 efter auth-reset.

## PR-triage / HOLD

- #254 — DEMO: **draft / BLOCKED_ENV**, kodgate grön; merge förbjuden tills env + submission smoke är verifierbar.
- #239 — HOLD: dokumentarkiv paginering/filter måste reconcileras mot current main innan återanvändning.
- #218 — FROZEN HISTORICAL STACK: återanvänd inte direkt.
- #223 + #260 — HOLD: Prisma client/CLI major-upgrade måste hanteras som koordinerad separat dependency-task.
- #191 — HOLD: actions/checkout major.
- #222 — HOLD: CodeQL major.
- #194 — HOLD: separat react-dom dependency-task.
- #259 + #261 — HOLD: tailwind-merge/Tailwind 4 är breaking dependency-spår och ska inte blandas med P0-arbete.

## Branch quarantine

Äldre `agent/*`, `cursor/*` och `claude/*` branches är **inte aktiva bara för att de existerar**. Innan eventuell återanvändning krävs current-main-verifiering, compare, kontroll av merged/superseded status, isolering av unik diff och explicit handoff.

`noop` är en inaktiv, oavsiktlig branch utan avsett unikt arbete och kan städas separat när branch-delete görs säkert.

## Leveransordning

1. **REV-AUTH-RESET-001 — FINAL GATE**
2. **REV-OBS-002 — issue #217**
3. **REV-DEMO-001 — när Vercel/env är verifierbar**
4. **REV-VERCEL-002** förblir blockerad tills connector scope faktiskt ändras.
5. Därefter P1-produktarbete först efter ny current-main-reconciliation.

## Handoff / Definition of Done

En task är inte DONE bara för att kod eller dokument är skrivna. Relevant task ska redovisa baseline SHA, branch, changed files, implementation, tester/validering, lint/typecheck/full quality gate, security/tenant/accessibility/database impact, CI, CodeQL, exact-SHA Preview, relevant browser E2E/smoke, PR/review, compare mot current main, merge med förväntad HEAD, Production deploy/smoke, runtime-loggkontroll där åtkomst finns, kvarvarande risker och uppdaterat ledger/task-register.

Om en kontroll inte kan utföras ska status vara **BLOCKED**. Gissa aldrig att den är grön.
