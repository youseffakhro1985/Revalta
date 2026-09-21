# Emergency bypass — Revalta `main`

Bypass of GitHub ruleset `protect-main` is break-glass only. It is not a normal merge path.

## When bypass may be used

Only when all of the following are true:

1. There is a confirmed production incident or an equally severe availability/security event.
2. Waiting for the required checks would increase harm.
3. The change is the smallest possible mitigation.
4. The repository owner accepts the risk in writing (commit message, PR comment, or incident note).

Bypass must **not** be used because:

- Vercel Hobby Preview was rate-limited
- Preview Browser E2E timed out waiting for an unpublished Preview
- a Dependabot PR is noisy
- local tests were green

If Preview cannot be published, mark the PR `BLOCKED / PREVIEW NOT VERIFIED` and leave it open.

## Required checks that `main` normally enforces

Exact GitHub check names (must match workflow job names):

- `Lint, test, migrate and build` (workflow **Revalta CI**)
- `Analyze JavaScript and TypeScript` (workflow **CodeQL**)
- `Auth, navigation, mobile and Command Center` (workflow **Preview Browser E2E**)

Do not rename those jobs without first updating the ruleset.

## Who is responsible

The GitHub user who holds ruleset bypass (currently the repository owner) is the only person who may bypass. Delegating bypass without updating this document is not allowed.

## Obligatory after-action

Within the same working session as a bypass merge:

1. Write an incident note in `docs/audits/` with SHA, reason, checks that were red, and the mitigation.
2. Run Production smoke: `GET /api/health` must show `ok`, current SHA, `schemaReady` and the Production data-plane identity.
3. Re-run or complete the skipped required check as soon as the incident is stable.
4. Open a follow-up PR if the bypassed change still needs Preview Browser E2E.

## GitHub administration (owner)

Code cannot change the ruleset. Owner actions if the gate drifts:

1. Keep `protect-main` on `main` with `strict` required checks.
2. Keep bypass as break-glass, not `always` for automation.
3. Do not add a second bypass actor without an incident reason.
