# Backup v7 — implementation specification

Status: design only; not integrated into the application.

Scope:
- Accounting data, customers, invoices, and accounting settings
- Project workspace data and workers
- Business profile and logo
- Invoice sequence high-water mark
- Report archive, report settings, report workflow, report notifications, and report email settings
- Application language preferences
- Help/contact drafts are excluded by default because they may contain personal information.
- Diagnostic/activity log is optional and excluded by default.
- Temporary restore/factory-reset recovery keys are never exported.

Company section and Company-specific data are explicitly out of scope for this work. No Company data or code is to be read, modified, tested, exported, or restored.

Required envelope:
- app: "The Handyman Accountancy"
- backupType: "complete-user-data"
- backupSchemaVersion: 7
- appVersion, createdAt
- data: required accounting, projects, businessProfile, invoiceSequence
- settings: allowlisted non-sensitive report and language settings
- integrity: per-section record counts and SHA-256 digests

Export requirements:
1. Read source values without mutating them.
2. Validate each required section before producing a file.
3. Preserve exact source JSON values; do not normalize project prices or rewrite records during export.
4. Calculate counts and SHA-256 digests from canonical serialized section payloads.
5. Verify the generated envelope can be parsed and every digest/count matches before triggering download.
6. Clearly distinguish "download initiated" from "file saved by the user"; browser JavaScript cannot prove the latter.

Restore requirements:
1. Parse and validate schema/version and all required sections before asking for confirmation.
2. Verify all section digests and counts before touching current storage.
3. Create and read-back-verify a recovery snapshot outside the imported payload.
4. Write only allowlisted v7 keys; never touch Company-specific keys or temporary recovery keys.
5. Read back and compare each written section against the imported canonical payload.
6. On any failure, roll back all touched keys and verify rollback.
7. Retain the recovery snapshot and enter a protective state if rollback cannot be verified.
8. Support older backup formats through explicit versioned migration functions; never silently guess missing required sections.

Testing requirements (synthetic data only):
- valid export/import round trip
- invalid JSON and unsupported schema
- missing required section
- tampered section digest
- malformed records and wrong types
- LocalStorage quota/write failure at each write position
- rollback success and rollback failure
- preservation of pre-existing data after every rejected/failed restore
- sequence high-water mark does not decrease
- exact equality of imported/exported allowlisted sections

Release constraints:
- Work only on existing branch test/v220-accounting-transfer-checkbox.
- Do not create branches.
- Do not change main or publish to production.
- Do not run tests against the user's real browser data.
- No implementation or live test is implied by this specification.
