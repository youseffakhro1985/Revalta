# GitHub release gate

Verified against repository ruleset `protect-main` on 2026-09-21 at main `92adc33dfd224c698f8a31d0ce59a808faed355e`.

## Enforced on `main`

- Pull request required
- Branch must be up to date (`strict_required_status_checks_policy`)
- Required checks, exact names:
  1. `Lint, test, migrate and build`
  2. `Analyze JavaScript and TypeScript`
  3. `Auth, navigation, mobile and Command Center`

Classic branch protection API reports `Branch not protected` because Revalta uses a ruleset, not the legacy protection API.

## Bypass

See `docs/EMERGENCY_BYPASS.md`. Bypass is break-glass. Do not use `--admin` merge when Preview is unpublished because of Hobby quota.

## Owner administration

If a workflow job is renamed, update the ruleset in the same change window or `main` will either be unprotected or permanently blocked.

Dependabot PRs `#261` `#260` `#259` `#223` `#194` stay on HOLD.
