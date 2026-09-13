# REV-RELEASE-TRUTH-001 — required Preview acceptance

Baseline main: `af995a8ab520cabb3f7d0613bb8d1fa4b02f1ca3` (fresh git fetch + GitHub API).
Branch: `agent/rev-release-truth-001`.
Implementation owner for this bounded task: ChatGPT Work, explicitly requested by the repository owner in this conversation after the read-only audit. Cursor resumes ownership after handoff; do not implement this scope in parallel.

## Problem and change

The required browser check previously allowed a local fallback and reported success on Preview after skipping authenticated dashboard/mobile/Command Center verification. Existing target and release validators were not connected to the executable runner.

The runner now requires reviewed datastore identity, matching direct connection, full candidate SHA, identified Preview and isolated verified fixtures before browser launch. It checks runtime identity before each browser mutation and at completion. Missing required steps and changed deployments cannot pass. Login/profile verify the expected active owner/company before public registration/reset tests. Properties and search must return valid real API responses. The workflow keeps its required check name, removes local fallback and derives its summary from actual runner outcome.

No application, auth policy, tenant rules, Prisma, database migrations, billing, pricing, UI or production settings change.

## Operations prerequisites — no assumed verification

- `E2E_PREVIEW_DATA_ISOLATED` repository variable: `1` only after independent evidence that the pinned Preview datastore and synthetic fixtures are isolated from Production.
- Repository secrets: `E2E_VERIFIED_EMAIL`, `E2E_VERIFIED_PASSWORD`, `E2E_VERIFIED_COMPANY_ID`; optional `VERCEL_AUTOMATION_BYPASS_SECRET` when Preview Protection requires it.
- Existing reviewed data-plane attestations stay unchanged. Do not alter them to make a wrong environment pass.
- Exact Preview must be discoverable by GitHub deployment metadata, or provided as the manual workflow URL for that workflow's candidate SHA.
- The suite creates synthetic registration data and requests verification/reset email only after isolation verification. Fixture provisioning, retention/cleanup and migration status are operational prerequisites, not performed by this change.

## Acceptance evidence

Local results and publication details are recorded below before handoff. Direct Vercel runtime, actual fixture credentials, Preview DB mapping and migration state: **BLOCKED / NOT VERIFIED** until fresh external evidence is available. No remote browser mutations were performed during implementation. This code change alone grants no release approval and closes no other audit finding.

### Local verification (2026-09-13)

- Node 24.19.0; dependencies installed from current lockfile; Prisma 5.22.0 client generated.
- Release configuration, full ESLint, UI interaction audit and dashboard integrity audit: PASS.
- Complete Vitest suite: 217 files, 1,544 tests PASS. Includes 28 new orchestration/entry-point regression tests.
- Initial TypeScript check found test-fixture typing errors. Fixed test types; reran 28 tests and test-file lint: PASS. Final full TypeScript check: PASS.
- Production dependency audit: 0 vulnerabilities.
- `npm run build:ci`: PASS, including TypeScript and static page generation.
- Workflow YAML and embedded Bash syntax: PASS. `git diff --check`: PASS.
- Executable runner with missing Preview configuration: exit 1, fixed non-sensitive BLOCKED message, no browser launched.
- No local or remote migration was applied. Clean-database migrations and remote CI/CodeQL are NOT RUN for this candidate yet.
- Local git publication preflight failed because no GitHub username/credential is configured (`terminal prompts disabled`). This is an authentication limitation, not a code/test result.

Release verdict remains NO-GO for Revalta as a whole. Candidate Preview acceptance: BLOCKED / NOT VERIFIED pending isolated runtime and independent review.
