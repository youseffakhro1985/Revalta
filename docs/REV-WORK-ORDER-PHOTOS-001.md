# REV-WORK-ORDER-PHOTOS-001 — compatible completion photo categories

Owner: ChatGPT Work under the repository owner's explicit request to continue audit fixes. Cursor performs independent review; no parallel implementation of this scope.
Main baseline: af995a8ab520cabb3f7d0613bb8d1fa4b02f1ca3.
Dependency: PR #444, bcdba80019f66f222dbfcd3a2dfb3056fe40d4f2, to retain fail-closed Preview verification.

The work-order document uploader persists `before` / `after`; the operational-document path also uses `before_photo` / `after_photo`. Completion previously counted only the latter. Its existing tenant/work-order-scoped query now accepts both vocabularies. No data rewrite, upload category change, schema migration, soft-delete policy or relaxation of the required after-photo count.

Validation: 25 targeted execution/atomicity tests; complete suite 217 files / 1,548 tests; changed-file lint and full TypeScript PASS. Four tests execute the actual count query against in-memory relational fixtures using Node's SQLite engine (only the PostgreSQL integer cast is removed). They cover each vocabulary, mixed rows, non-photo categories and exclusion of other tenants/work orders. This is not PostgreSQL runtime or live browser evidence.

Draft only. CI/CodeQL main-target filters require retarget/reconciliation after #444 is approved and merged; never merge directly into the parent branch as a shortcut. Production build, exact-SHA Preview browser, fixture/datastore isolation and migration/restore evidence: BLOCKED / NOT VERIFIED. No remote browser/data mutation was performed during implementation. Revalta remains NO-GO.
