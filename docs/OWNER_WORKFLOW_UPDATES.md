# Owner workflow updates

`BLOCKED / NOT VERIFIED` for GitHub Actions YAML in this PR.

The GitHub token used to publish the branch does not have the `workflow` scope, so workflow files cannot be created or updated remotely. Application health, portal fail-closed checks and `scripts/assert-database-target.mjs` still ship in code.

Grant `workflow` scope, then apply the changes below on a follow-up branch. Do not paste Production connection strings into Preview.

## 1. Production Uptime

Require `schemaReady === true`, Production environment, attested Production data-plane identity, and reject the Preview identity. Probe `https://www.revalta.se/api/health` only. HTTP 200 without those fields is not green.

Pinned identities (non-secret):

- Production: `e51d9599fa4b3c03898d33a44d3fb5973987e8fd3569896aa3c005fc5673ba2a`
- Preview: `6237f01010de725a8e35dcdb90b4f1b933bb009aa2d822155d6efe18f61ede3f`

## 2. Production Release Monitor

Keep SHA equality against current `main`. Remove the ten-minute grace `exit 0`. Require `schemaReady`, `dataPlane.directMatches`, Production attestation, and `components.*.ok`. A SHA mismatch must fail.

## 3. Database Release and Database Status

After secret validation, before Prisma generate:

```bash
node scripts/assert-database-target.mjs --target production
```

Never point these workflows at GitHub Environment `Preview`.

## 4. New Preview Database Status

Manual workflow, `environment: Preview`, confirmation none, read-only `prisma migrate status`. Must:

- use GitHub Environment `Preview` secrets only
- run `node scripts/assert-database-target.mjs --target preview`
- never contain `prisma migrate deploy`
- never use concurrency group `revalta-production-database-release`

Owner must first copy Vercel **Preview** `DATABASE_URL` and `DIRECT_URL` into GitHub Environment `Preview`. That environment currently has zero secrets.

## 5. New Preview Database Migrate

Manual workflow, `environment: Preview`, job `if: inputs.confirmation == 'PREVIEW_MIGRATE'`. Must:

- refuse to run without that confirmation
- assert Preview identity before `prisma migrate deploy`
- verify `prisma migrate status` after deploy
- never accept Production secrets or `MIGRATE_PRODUCTION`

## 6. After applying

Re-run Preview Browser E2E on a later PR. Do not merge with `--admin` if Preview is unpublished because of Hobby quota.
