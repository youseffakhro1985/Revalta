# REV-LOG-REDACTION-001 — Redact nested Error values

Owner: ChatGPT Work, explicitly authorized by the repository owner to continue the audit fixes. Cursor is the independent reviewer and subsequent implementation owner; no parallel work in this scope without handoff.

Source of truth: main `af995a8ab520cabb3f7d0613bb8d1fa4b02f1ca3`.
Dependency: PR #444, `bcdba80019f66f222dbfcd3a2dfb3056fe40d4f2`.
This PR targets #444's branch so it inherits fail-closed Preview verification. Do not merge or cherry-pick onto main without retaining that gate. After #444 is approved and merged, reconcile against freshly fetched main and rerun checks.

## Change and limits

Error names, messages, development stacks and causes pass through the existing recursive sanitizer. Circular/deep causes are bounded; production stacks remain omitted. No log provider, schema, retention or business-rule change.

## Local evidence

217 files / 1,548 tests; changed-file lint and full TypeScript: PASS. Production build and GitHub CI still require remote evidence.
No remote browser mutation, database migration or production configuration change was performed. Tests use synthetic fixtures; unit tests do not prove live database isolation.

## Release gate

Draft pending independent review, exact-SHA CI/CodeQL, real Preview browser evidence and proven datastore/fixture isolation. PR #444's job currently lacks E2E_VERIFIED_COMPANY_ID; do not guess it or weaken the gate. Runtime, migration state and restore remain BLOCKED / NOT VERIFIED. This is not approval to release Revalta or closure of all audit findings.
