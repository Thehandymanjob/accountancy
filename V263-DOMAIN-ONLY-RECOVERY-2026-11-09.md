# v263 domain-only recovery — 2026-11-09

## Added
`v263-domain-recovery.js` introduces an independent portable backup/restore API for:
- Accounting state (`accounting` only)
- Projects (`projects` only)
- Contracts (`contracts` only)
- Invoice sequence (`sequences` only; separate from Accounting state file)

Each backup declares exactly one physical domain and a named scope. Restore rejects a different domain, database, malformed record identity, duplicate record, or invalid SHA-256 digest. Restore uses the strict domain boundary and performs a post-restore record-count and full-value verification.

Binary media is encoded in the backup for Blob, File, ArrayBuffer and typed-array values, in addition to JSON values, dates, undefined and bigint.

## Explicitly not provided
- No combined Projects + Accounting backup.
- No whole-database restore.
- No factory reset / clear-all operation.
- No LocalStorage import or migration.
- No connection to the live application UI.

## Important operational note
Accounting state and invoice sequence currently produce two separate backup files. Keep both if you need the invoice numbering sequence preserved. Projects and Accounting remain isolated.

## Verification status
Static source checks passed for the domain allowlist, one-domain enforcement, SHA-256 validation, binary serialization support, restore read-back verification, and absence of LocalStorage or whole-database reset calls. This is source inspection, not a browser runtime test.

## App integration status
The main `index.html` is still v262 and does not load this module. This code is not a released or user-facing recovery feature.
