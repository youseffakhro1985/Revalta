# Preview redeploy trigger — 2026-09-13

PR #426 remains fail-closed until exact-head Preview evidence is green.

The branch-specific Vercel Preview environment for `fix/revalta-preview-gate-2026-09-07` was manually corrected so that both `DATABASE_URL` and `DIRECT_URL` target the dedicated isolated Neon Preview data plane. No connection strings or credentials are recorded here.

This documentation-only commit intentionally triggers a fresh GitHub-linked Vercel Preview deployment on a new exact head SHA. All required CI, CodeQL, Preview Health Attestation and Preview Browser E2E checks must be evaluated again against that exact SHA before merge.

Production configuration, Production database, and `main` are unchanged.
