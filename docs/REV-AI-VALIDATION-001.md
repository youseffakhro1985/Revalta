# REV-AI-VALIDATION-001 — Validate untrusted AI responses

Owner: ChatGPT Work, explicitly authorized by the repository owner to continue the audit fixes. Cursor is the independent reviewer and subsequent implementation owner; no parallel work in this scope without handoff.

Source of truth: main `af995a8ab520cabb3f7d0613bb8d1fa4b02f1ca3`.
Dependency: PR #444, `bcdba80019f66f222dbfcd3a2dfb3056fe40d4f2`.
This PR targets #444's branch so it inherits fail-closed Preview verification. Do not merge or cherry-pick onto main without retaining that gate. After #444 is approved and merged, reconcile against freshly fetched main and rerun checks.

## Change and limits

Runtime allowlists constrain ticket category/priority; confidence must be finite and within 0–1; summary/action must be bounded strings. Malformed results use the existing deterministic fallback. Document outputs receive the same confidence/text checks. No provider configuration, prompt features, schema or billing change.

## Local evidence

21 targeted AI tests; full suite 217 files / 1,558 tests; changed-file lint and full TypeScript: PASS. Two existing work-order test mocks now retain real constants needed by the canonical priority import. Remote CI/build remains pending.
No remote browser mutation, database migration or production configuration change was performed. Tests use synthetic fixtures; unit tests do not prove live database isolation.

## Release gate

Draft pending independent review, exact-SHA CI/CodeQL, real Preview browser evidence and proven datastore/fixture isolation. PR #444's job currently lacks E2E_VERIFIED_COMPANY_ID; do not guess it or weaken the gate. Runtime, migration state and restore remain BLOCKED / NOT VERIFIED. This is not approval to release Revalta or closure of all audit findings.
