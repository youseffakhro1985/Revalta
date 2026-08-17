# Revalta AI Collaboration Ledger

GitHub `main` är alltid den enda tekniska sanningskällan. Ingen agent får skriva i ett aktivt område som ägs av en annan agent utan explicit handoff.

## Grundregler

- En task = ett tydligt problemområde = en ägare = en branch = en PR.
- Läs aktuell `main` och notera exakt SHA före varje ny task och direkt före merge.
- Läs `AI_COLLABORATION.md`, `AGENTS.md`, `CLAUDE.md`, `DESIGN_SYSTEM.md`, `INTEGRATIONS.md` och relevanta docs innan produktkod ändras.
- Kontrollera öppna PR:er, issues, Preview/Production-status och Vercel där åtkomst finns.
- Gamla ChatGPT/Cursor/Claude-branches är **quarantine** tills de har jämförts mot aktuell `main`.
- Tenant isolation är högsta säkerhetsinvarianten.
- Produktionsmigrationer går endast via dokumenterat Database Release-flöde.
- Inga secrets, credentials, sessionsdata, tokens eller DB-URL:er får skrivas i ledger, PR, screenshots eller loggar.
- Befintlig svensk/skandinavisk premiumdesign bevaras.
- Maskinläsbar status speglas i `docs/AI_TASKS.yml`.

## Verifierad snapshot

- Datum: `2026-08-18`
- Aktuell verifierad `main`: `dd593d62c9cfa374ae00eff21ecffd8bab172df1`
- Commit: `fix: bound registration response latency`
- Production: `https://www.revalta.se`
- Vercel status för exakt merge-SHA: **SUCCESS**
- Vercel connector: **BLOCKED_CONNECTOR** — teamet syns men Revalta-projektet kan fortfarande inte listas. Full env/runtime/log-audit får inte påstås vara verifierad.
- Sprint: **P0 — observability; demo fortsatt blockerad av env/access**

> Läs alltid GitHub `main` igen före nästa branch och direkt före merge.

## Nästa aktiva produkt-task

| Task-ID | Ägare | Issue | Status | Baseline |
|---|---|---|---|---|
| REV-OBS-002 | ChatGPT Work | #217 | **READY_NEXT** | Läs färsk `main` efter koordinationsmerge innan branch skapas |

### REV-OBS-002 — scope

Issue #217 kräver Observability phase 2 utan affärsregel-, behörighets-, schema- eller migrationsändringar.

Prioriterad implementation:

1. återanvänd/färdigställ route-observability-helpern,
2. authflöden,
3. cron-routes,
4. Stripe webhook,
5. felanmälan/arbetsorder och därefter övriga kritiska verksamhets-API:n.

Krav:

- samma verifierade `requestId` i intern logg, respons-header och felpayload,
- intern kontext: route, method, release, environment, latency och stabil event/error code,
- publika fel: säkert meddelande + stabil `errorCode` + `requestId`, privat `no-store`,
- inga passwords, reset/verifieringstokens, cookies, sessionsdata, JWT, `CRON_SECRET`, Stripe-signaturer, rå webhook-body, DB-URL:er, e-post, namn eller fritext i nya loggar,
- user/company/Stripe-ID endast från verifierad intern källa,
- Production får inte exponera stack trace,
- inga nya externa loggleverantörer eller DB-tabeller för tekniska request-events,
- full CI, CodeQL, exact-SHA Preview och relevanta browser/smoke-bevis före merge.

### REV-OBS-002 — initialt filägarskap

Fastställs efter färsk current-main-read och routeinventering. `REV-DEMO-001`-filerna är förbjudna och förblir låsta.

## Slutförda P0 auth-tasks

| Task-ID | Issue | PR | Merge SHA | Verifierad status |
|---|---|---|---|---|
| REV-AUTH-RESET-001 | #265 CLOSED | #267 | `68670b9378c49b4806eb33acc737da0719ae9ed1` | CI #1014, CodeQL #306, exact-SHA Preview + Browser E2E, Production exact-SHA deploy SUCCESS. Direkt Production reset-POST/runtime logs var verktygsblockerade och påstods inte gröna. |
| REV-AUTH-REGISTER-001 | #268 CLOSED | #272 | `dd593d62c9cfa374ae00eff21ecffd8bab172df1` | CI #1028, CodeQL #320, exact-SHA Preview + Browser E2E #35; reset 351 ms, register HTTP 201 857 ms; Production exact-SHA Vercel status SUCCESS. Direkt muterande Production-registertest kördes avsiktligt inte. |

Registreringsfixen behåller obligatorisk e-postverifiering. Konto + verifieringstoken + audit commitas före 201; verifieringsleverans körs post-response via Next.js `after()` och den befintliga integrationslogiken behåller sann `sent/failed`-status.

## Blockerade / parallella tasks

| Task-ID | Status | Källa | Nästa säkra steg |
|---|---|---|---|
| REV-VERCEL-002 | **BLOCKED_CONNECTOR** | Vercel team syns men Revalta-projektet kan inte listas | Återställ verifierbar project access; läs därefter project/env/deploy/runtime utan secretvärden |
| REV-DEMO-001 | **BLOCKED_ENV — CODE GATE GREEN** | Draft PR #254 | Verifiera `DEMO_REQUEST_TO` status + Preview submission smoke innan merge |

### REV-DEMO-001 — fortsatt fil-lås

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

Observability-arbete får inte röra detta scope utan explicit handoff.

## Slutförda produkt- och plattformstasks

| Task-ID | Resultat | PR | Merge SHA |
|---|---|---|---|
| REV-COORD-002 | Collaboration ledger + PR-triage | #251 | `b8138046087a7a93c6d346a58658f7bf006097dc` |
| REV-NAV-001 | Navigation v2 + Settings/Admin IA | #252 | `354de1e0ba408525a4e47c2b6f16a038929e60f7` |
| REV-BREAD-001 | Gemensamma breadcrumbs + lokal modulnavigation | #253 | `e24feff5f2e48c22b913b444b6c8ffd5cf82ee63` |
| REV-COORD-003 | Command Center/demo handoff | #255 | `b7cad49965b3c5c714cea8cc907a2f9170eafc24` |
| REV-SEARCH-001 | Revalta Command Center | #256 | `a93f0fd050e88ba344f96e8d0685d4d3da26153a` |
| REV-DASH-ROLE-001 | Rollbaserade dashboards | #257 | `9147f3e88156d1eb1e6a59c1f70856cc4dba8183` |
| REV-PROPERTY-001 | Digital fastighetspärm/workspace | #258 | `d7d4d5624a16e4b6baf47b82b97fc4777d4d4d0d` |
| REV-ONBOARD-001 | Tenant-scopad first-run onboarding | #262 | `b9253cda99a79780477ef3b09150ba03c56338cd` |
| REV-ROUTES-001 | Canonical dashboard routes | #263 | `a839728684984f8e5233093153972ec69e7e3f4d` |
| REV-E2E-AUTH-001 | Exact-SHA browser-E2E foundation | #264 | `ed4b4d1e38f354eb054f1233de12571312d1d290` |
| REV-COORD-004 | Task registry / multi-agent truth | #266 | `5537f6a49d168cb3ed9b683668c6dbddad81b16d` |

PR #269 var docs-only men stängdes **superseded** efter att dess browsergate korrekt exponerade #268; den får inte återanvändas mot ny `main`.

## PR-triage / HOLD

- #254 — DEMO: draft / BLOCKED_ENV.
- #239 — HOLD: dokumentarkiv måste reconcileras mot current main.
- #218 — FROZEN HISTORICAL STACK.
- #223 + #260 — HOLD: Prisma major måste koordineras separat.
- #191 — HOLD: actions/checkout major.
- #222 — HOLD: CodeQL major.
- #194 — HOLD: react-dom dependency.
- #259 + #261 — HOLD: Tailwind/tailwind-merge breaking upgrades.

## Branch quarantine

Äldre `agent/*`, `cursor/*` och `claude/*` branches är inte aktiva bara för att de finns. Före återanvändning krävs current-main-verifiering, compare, merged/superseded-kontroll, isolering av unik diff och explicit handoff.

`agent/auth-register-bounded-latency` är en stale/dirty arbetsbranch och får inte återanvändas. Den giltiga registreringsfixen kom från den rena branchen `agent/auth-register-bounded-latency-clean` och är redan mergad via #272.

`noop` är en inaktiv, oavsiktlig cleanup-kandidat.

## Leveransordning

1. **REV-OBS-002 — issue #217** efter denna koordinationssync.
2. **REV-DEMO-001** när Vercel/env-status är verifierbar.
3. **REV-VERCEL-002** kvarstår BLOCKED_CONNECTOR tills connector scope ändras.
4. Därefter P1 endast efter ny current-main-reconciliation.

## Handoff / Definition of Done

En task är inte DONE bara för att kod är skriven. Redovisa baseline SHA, branch, changed files, implementation, tester, lint/typecheck/full quality gate, security/tenant/accessibility/database impact, CI, CodeQL, exact-SHA Preview, relevant browser/smoke, PR/review, compare mot current main, merge med expected HEAD, Production deploy/smoke, runtime-loggkontroll där åtkomst finns, kvarvarande risker och uppdaterad ledger/task-register.

Om en kontroll inte kan utföras ska status vara **BLOCKED** eller **NOT RUN**. Gissa aldrig att den är grön.
