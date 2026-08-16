# Revalta AI Collaboration Ledger

Detta dokument är den centrala samarbetsfilen för ChatGPT Work, Cursor och Claude.ai.

## Grundregler

- GitHub `main` är enda tekniska sanningskällan.
- Ingen agent får börja skriva i ett aktivt område som ägs av en annan agent utan explicit handoff.
- En task = ett tydligt problemområde = en branch = en PR.
- Innan en task startas ska aktuell `main` SHA verifieras.
- Innan merge ska branchen jämföras mot aktuell `main` och hela quality/release-grinden köras när relevant.
- Stora historiska branches eller PR:er får aldrig mergas blint.
- Direktarbete på `main` ska undvikas; produktkod ska gå via branch + PR + verifiering.
- Produktionshemligheter får aldrig skrivas i denna fil, PR-beskrivningar eller loggar.

## Aktuell snapshot

- Main SHA vid senaste koordinationsrefresh: `d33d0a2f11168ed7b59c2361f658b29d584ddcdb`
- Snapshotdatum: 2026-08-16
- Pågående sprint: **S0 — Post-merge stabilization, collaboration governance och UX-arkitektur**
- Production: `https://www.revalta.se`

## Aktiva och blockerade arbeten

| Task-ID | Ansvarig agent | Branch / källa | Ägda filer/moduler | Status | Beroenden | Acceptance criteria | PR | Verifiering |
|---|---|---|---|---|---|---|---|---|
| REV-COORD-001 | ChatGPT / Lead Product Engineer | `agent/ai-collaboration-governance` | `AI_COLLABORATION.md` | IN PROGRESS | Ingen | Central samarbetsfil finns, aktuell main SHA dokumenterad, aktiva områden och holds synliga | TBD | Diff + PR-review |
| REV-244-AUDIT | ChatGPT / Lead Product Engineer | Read-only audit av mergad PR #244 | PR #244 diff, release/säkerhet/migration/deps/UI | IN PROGRESS | Aktuell `main` | Klassificera vad #244 tillförde, vad som ändrats efteråt, regressionsrisker och små follow-up tasks | #244 är redan merged | GitHub compare + filgranskning |
| HOLD-AUTH-CLEANUP | EXTERNAL / HANDOFF REQUIRED | direkt commits på `main` | `Revalta Nyny3/**`; auth-området i övrigt är låst för parallella writes | CLEANUP REQUIRED / DO NOT TOUCH | Identifiera ägare och avsluta pågående auth-arbete | Riktig `src/lib/auth.ts` är uppdaterad separat; felplacerad kopia tas bort i egen verifierad cleanup-task efter handoff | Ingen | Commits `95cd672...` och `d33d0a2...` granskade |
| HOLD-PR218 | Historisk agent | `agent/auth-observability-foundation` | tenant/auth/public portal/release-governance | FROZEN | Reconcile mot current main | Ingen blind merge; endast små, isolerade och återvaliderade delar får återanvändas | #218 | 158 commits ahead / 74 behind vid audit |
| HOLD-PR239 | Historisk audit-agent | `audit/document-pagination` | dokumentlista + documents API + test | REBASE/REVIEW REQUIRED | Current main | Rebase/re-implement mot latest main, därefter full tests/preview | #239 | 4 ahead / 57 behind vid audit |
| HOLD-PR248 | Okänd / manuell upload | `team-hantering` | inga nettoskillnader mot main | CLOSE CANDIDATE | Bekräfta avsikt | Ingen merge av tom/stale PR | #248 | 0 changed files i PR; compare visar inga filskillnader |

## Planerade tasks — ännu inte aktiva

Dessa rader reserverar inte filer förrän status ändras till `IN PROGRESS`.

| Task-ID | Föreslagen ägare | Föreslagen branch | Scope | Status | Acceptance criteria |
|---|---|---|---|---|---|
| REV-NAV-001 | Cursor | `cursor/navigation-v2` | Informationsarkitektur och vänsternavigation | PLANNED | Färre samtidiga destinationer, rollstyrning bevarad, desktop/mobile fungerar, inga nya designspråk |
| REV-BREAD-001 | Cursor | `cursor/breadcrumbs-system` | Gemensam breadcrumb + lokal modulnavigation | PLANNED | Ett återanvändbart komponentmönster över dashboarden |
| REV-SEARCH-001 | Cursor | `cursor/command-center` | Bygg vidare på befintlig `GlobalSearch` | PLANNED | Global search + navigation + quick actions + recents + favorites utan parallell sökkomponent |
| REV-DASH-ROLE-001 | Claude | `claude/role-dashboard-audit` | Owner/Admin, Manager, Technician dashboardarkitektur | PLANNED | Rollspecifika vyer utan dataduplicering; resident fortsatt separat |
| REV-PROPERTY-001 | Cursor | `cursor/property-workspace` | Fastigheten som central arbetsyta | PLANNED | Sammanhängande digital fastighetspärm med befintlig datamodell |
| REV-ONBOARD-001 | Claude | `claude/first-run-onboarding` | Ny organisations onboarding | PLANNED | 5 steg, progress, tydliga tomlägen, roll/tenant-säkerhet |
| REV-DEMO-001 | Cursor | `cursor/demo-conversion-flow` | `/demo` + CTA-routing | PLANNED | `Boka demo/visning` går till demo/kontakt; `/register` endast `Skapa konto`; ingen falsk social proof |
| REV-ROUTES-001 | ChatGPT | read-only först | Canonical route-plan för `(dashboard)/dashboard` vs `app/dashboard` | PLANNED | Inventering, redirects och tester före borttagning |
| REV-E2E-001 | Cursor | `cursor/e2e-critical-flows` | Browserbaserade E2E | PLANNED | Kritiska auth/tenant/property/ticket/work-order/resident/nav/search/mobile-flöden mot Preview |
| REV-VERCEL-001 | ChatGPT | read-only | Autentiserad Vercel-audit | BLOCKED | Projektåtkomst via Vercel connector måste fungera; endast PRESENT/MISSING/MISCONFIGURED för secrets |

## Handoff-protokoll

När en agent lämnar över ett aktivt område ska följande fyllas i innan nästa agent skriver:

1. Task-ID
2. aktuell branch och HEAD SHA
3. exakt fil-/modulscope
4. vad som är implementerat
5. vad som återstår
6. tester som körts och resultat
7. kända risker
8. databas-/säkerhetspåverkan
9. PR-länk/nummer om sådan finns
10. explicit rad: `HANDOFF COMPLETE — next owner: <agent>`

## Definition of Done per task

En task får markeras `DONE` först när följande kan redovisas:

- Task-ID
- branch
- ändrade filer
- varför ändringen behövdes
- lint
- typecheck
- relevanta tester
- full quality gate när relevant
- Preview-resultat
- browser smoke
- accessibility
- security impact
- database impact
- commit SHA
- PR
- merge-SHA när mergad
- production smoke när produktionspåverkande
- runtime-loggkontroll när produktionspåverkande
- kvarvarande risker
