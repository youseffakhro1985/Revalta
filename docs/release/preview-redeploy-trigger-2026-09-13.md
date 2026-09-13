# Preview redeploy trigger — 2026-09-13

PR #426 remains fail-closed until exact-head Preview evidence is green.

The branch-specific Vercel Preview environment for `fix/revalta-preview-gate-2026-09-07` has now been corrected so that both `DATABASE_URL` and `DIRECT_URL` target the dedicated isolated Neon Preview data plane. The Preview database role credential was rotated after accidental exposure during manual setup, and both branch-scoped Vercel Preview variables were updated to the rotated credential. No connection strings or credentials are recorded here.

A previous verification deployment was started before the final `DIRECT_URL` save was complete. This documentation-only commit intentionally triggers a fresh GitHub-linked Vercel Preview deployment after that final save, on a new exact head SHA. All required CI, CodeQL, Preview Health Attestation and Preview Browser E2E checks must be evaluated again against that exact SHA before merge.

Production configuration, Production database, and `main` are unchanged.
