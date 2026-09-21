# Production database policy

Revalta stores customer property, lease, ticket, work-order and document data. The Production dataplane is a commercial recovery target, not a development sandbox.

Do not infer which Neon branch is Production from its name. Identity is the non-secret SHA-256 from `databaseTargetIdentity()` compared with `src/lib/data-plane-attestations.json`.

## Attested identities (non-secret)

- Production: `e51d9599fa4b3c03898d33a44d3fb5973987e8fd3569896aa3c005fc5673ba2a`
- Preview: `6237f01010de725a8e35dcdb90b4f1b933bb009aa2d822155d6efe18f61ede3f`

These must remain different. Updating either datastore requires a reviewed change to the attestation file.

## Before GA — owner checklist

| Control | Target | Status |
| --- | --- | --- |
| Neon plan | Paid plan with PITR, not Hobby defaults | `OWNER DECISION REQUIRED` |
| PITR retention | At least 7 days; 14 days preferred | `BLOCKED / NOT VERIFIED` |
| Protected Production branch | Neon default branch protected against reset/delete | `OWNER DECISION REQUIRED` |
| Compute / pool | Sized for production connections; no unbounded serverless stampede | `BLOCKED / NOT VERIFIED` |
| `DATABASE_URL` vs `DIRECT_URL` | Same dataplane identity | Enforced by `scripts/assert-database-target.mjs` |
| Preview isolation | Preview identity ≠ Production identity | Enforced in health + migrate workflows |
| Backup owner | Named person for restore decisions | `OWNER DECISION REQUIRED` |

Suggested commercial targets until the owner records otherwise:

- RPO: ≤ 1 hour (PITR)
- RTO: ≤ 4 hours to an isolated restore that passes schema + smoke
- Incident owner: repository owner until delegated

Repo code must never purchase a Neon plan or mutate Production retention.

## Restore drill (isolated, non-destructive)

Never run destructive SQL against Production to “test backup”.

1. Create a Neon PITR clone / branch from a documented Production timestamp.
2. Record the clone’s `databaseTargetIdentity()`. It must **not** equal Production after you point a throwaway URL at the clone.
3. `npx prisma migrate status` on the clone using the clone URL only.
4. Read-only row counts for `Company`, `Property`, `Ticket`, `WorkOrder`, `Lease` (no updates).
5. Optional: point a local app or isolated Preview at the clone and run `npm run smoke:auth`.
6. Document result in `docs/audits/` with timestamp, SHA, identity hashes, pass/fail.
7. Delete the clone. Leave Production untouched.

## Migration rules

- Production: GitHub workflow **Database Release** with confirmation `MIGRATE_PRODUCTION` and Production identity assert.
- Preview: GitHub workflow **Preview Database Migrate** with confirmation `PREVIEW_MIGRATE`, Preview environment secrets, and Preview identity assert.
- Application builds must not run `prisma migrate deploy`.
- Additive, backward-compatible migrations first. Destructive changes use expand-and-contract.

## Owner action required for Preview schema

GitHub Environment `Preview` currently has no `DATABASE_URL` / `DIRECT_URL`. Copy those values from **Vercel Preview**, never from Production.

Workflow YAML that would run Preview status/migrate could not be pushed in the same PR (`workflow` scope missing). See `docs/OWNER_WORKFLOW_UPDATES.md`. Until that is applied, run:

```bash
DATABASE_URL=... DIRECT_URL=... npm run assert:database-target -- --target preview
npx prisma migrate status
```

only against Preview URLs. Never against Production.
