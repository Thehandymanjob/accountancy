# THA v250 — IndexedDB Migration Map (Working Specification)

Status date: 2026-11-07  
Target branch: `release239` in `Thehandymanjob/accountancy-test`  
Target database: `the_handyman_accountancy_v250_idb`  
Status: design/audit only; **no application cutover**

## 1. Safety and current verified state

- The v250 repository module is `storage-repository.js`, database schema version 1.
- Its repository API is asynchronous: `ready`, `get`, `readMany`, `put`, `remove`, `transact`, `mutate`, `mutateMany`, `reserveCounter`, `snapshot`, `restore`, `health`, `selfTest`.
- The v250 migration bridge copies exact LocalStorage key/value strings to the `legacy` domain. It does not parse, normalize, merge, or delete source data.
- User-provided runtime result: 40 keys staged atomically; 40 verified; 0 missing; 0 conflicts; LocalStorage unchanged; `appCutover:false`.
- The snapshot export from the migration lab has not yet been confirmed.
- The app entry point still loads `storage-foundation.js` and `version-manager.js`; it does not load `storage-repository.js`.
- `storage-foundation.js` targets the separate database `the_handyman_accountancy_test226`; it is not the v250 repository and must not be used as the v250 migration destination.
- The current `index.html` contains approximately 93 direct LocalStorage method calls. Its existing synchronous persistence flow cannot be safely replaced by simple find-and-replace because IndexedDB operations are asynchronous.

## 2. Proposed logical domain map

This is a proposed destination map, not an instruction to transform or delete records now. Keep the original exact strings in `legacy` permanently until the user approves a later retirement policy.

| Source data / known key | Proposed v250 domain | Proposed record key | Required treatment |
|---|---|---|---|
| `tha_test226_accounting_v1` | `accounting` | `main` | Preserve the complete parsed object, including entries, customers, invoices, categories and settings. Validate structure before activation. |
| `tha_test226_projects_v1` | `projects` | `main` | Preserve projects, workers, partners, contractors, companies, company jobs and profile. Review legacy materials-to-expenses startup conversion before enabling it. |
| `tha_test226_contracts_v1` | `contracts` | `main` | Preserve the full array and stable IDs; validate each record has a string ID. |
| `tha_test226_invoice_sequence_v1` | `sequences` | `invoice` | Preserve high-water mark and reconcile against every existing invoice/income number before reserving new numbers. Never reset or reuse numbers. |
| `tha_test226_isolation_test_record_cleanup_v1` | `maintenance` | `isolation-test-cleanup` | Preserve as operational metadata; do not execute cleanup merely because the key exists. |
| `tha_test226_invoice_sequence_cleanup_v1` | `maintenance` | `invoice-sequence-cleanup` | Preserve and inspect semantics; do not run automatically during migration. |
| `tha_test226_empty_invoice_sequence_reset_v229` | `maintenance` | `empty-sequence-reset-v229` | Preserve as historical control state; never let it reset a live sequence during cutover. |
| `tha_test226_factory_reset_recovery_v1` | `recovery` | `factory-reset` | Preserve as recovery material. Must not be mistaken for active business data. |
| `tha_test226_monitor_log_v1` | `diagnostics` | `monitor-log` | Preserve existing events and timestamps; separate diagnostics from business records. |
| `tha_test226_report_archive_v1` | `reports` | `archive` | Preserve archived report HTML/content and metadata without re-rendering or altering historical snapshots. |
| `tha_test226_report_notifications_v1` | `reports` | `notifications` | Preserve notification state and IDs. |
| `tha_test226_report_settings_v1` | `reports` | `settings` | Preserve report configuration. |
| `tha_test226_report_workflow_v1` | `reports` | `workflow` | Preserve workflow state and dates. |
| `tha_test226_report_email_settings_v1` | `reports` | `email-settings` | Preserve separately; verify actual key spelling and presence in the staged inventory. |
| `tha_test226_help_contact_drafts_v1` | `support` | `contact-drafts` | Preserve drafts and timestamps. |
| `tha_test226_app_language_v1` | `preferences` | `language` | Preserve selected language. |
| `tha_test226_app_language_pref_version_v1` | `preferences` | `language-pref-version` | Preserve version marker together with language; review the existing version-204 reset/default logic so it cannot overwrite a migrated preference. |
| Other keys among the 40 staged keys, including older prefixes | `legacy` | original key | Keep byte-for-byte as staged. Do not classify as obsolete or merge into active records without reviewing actual contents and provenance. |

**Important:** The table lists keys identified in source-code audit and memory of the inventory, not a certified complete transcription of all 40 keys. The staged inventory/export must be used to confirm exact key names and presence. Never fabricate missing keys or infer that a namespace is disposable.

## 3. Data integrity rules

1. Preserve every source LocalStorage key/value pair as an immutable legacy copy.
2. Convert each known key into a typed domain record only after validating its JSON and expected shape.
3. Unknown, malformed, or ambiguous values remain in `legacy`; do not silently skip them.
4. Do not merge old namespaces (for example `handyman_accounting_v2`, `tha_v206_*`, `tha_v212_*`, `tha_restore_test_*`) into current records based only on similar names.
5. Keep stable IDs and all links between customers, projects, sub-projects, contracts, invoices, accounting entries, contractors and payments.
6. Preserve original dates, payment methods, invoice numbers, status flags, report snapshots and file/blob data.
7. A migration transform must be deterministic, repeatable and idempotent. Re-running it must not duplicate records or advance invoice numbering.
8. Cross-domain updates that must remain consistent (for example accounting plus invoice sequence) must use a single `mutateMany` transaction where appropriate.
9. Do not remove LocalStorage keys or close the legacy recovery path as part of initial cutover.
10. Do not restore a snapshot over live data without an explicit, verified recovery plan; repository `restore` replaces every record in the declared domains.

## 4. Application modules that require refactoring

The audit has identified LocalStorage access beyond the three primary business stores. The migration must cover all these paths, not just initial loading and saving:

- Accounting: initial load, persist/read-back verification, entries, customers, invoices, expense categories and settings.
- Projects: load/persist, project completion toggle, workers, partners, contractors, companies, jobs, work packages, expenses and linked payments.
- Contracts: read/write and stable-ID handling.
- Invoice numbering: sequence reservation, cleanup flags and any shared numbering with income entries.
- Backup/restore: export, import, recovery snapshot and validation.
- Reports: archive, notifications, report settings, workflow and email settings.
- Support: contact drafts.
- Diagnostics: monitor log, instrumentation hooks and self-test/cleanup state.
- Preferences: language and preference-version handling.
- Factory reset: recovery snapshot and reset workflow.

The source also contains direct LocalStorage access in helper functions and event handlers, so each call site must be classified by behavior (read, write, delete, clear, instrumentation) before refactoring.

## 5. Required implementation sequence

### Stage A — Preserve and inventory
- Confirm the v250 legacy snapshot JSON has been exported and stored safely by the user.
- Record the full 40-key inventory (key name, byte length, JSON validity and digest) without exposing business values unnecessarily.
- Verify the staged legacy domain count and compare it with the exported snapshot.

### Stage B — Typed conversion, without app cutover
- Add a deterministic converter that reads only from the staged `legacy` domain.
- Convert known keys to proposed typed domains in one atomic transaction.
- Include per-key source digest, conversion version, record counts and validation results.
- Stop on schema errors, duplicate IDs, invalid links, or invoice-number collisions. Do not guess a repair.
- Preserve unmapped keys unchanged in `legacy`.

### Stage C — Read-only parity validation
- Compare every converted domain against its source object: counts, IDs, amounts, dates, references, statuses and nested arrays.
- Reconcile invoice sequence against all invoice and income numbers.
- Verify project/customer/contract/invoice relationships and report archive counts.
- Test backup/export and restore using a disposable test namespace/database, not the live user data.
- Do not enable IndexedDB writes from the production UI during this stage.

### Stage D — Async application refactor
- Introduce an explicit asynchronous startup gate: the app must await repository readiness and validated data loading before enabling any editing controls.
- Refactor call chains and event handlers to await repository reads/writes; do not use a synchronous LocalStorage-shaped facade over asynchronous IndexedDB.
- Ensure every save path awaits transaction completion and verifies the committed result before displaying success.
- Ensure backup/restore, invoice reservation, monitor hooks, report settings, language, factory reset and project completion use the new repository.
- Avoid a mixed mode in which some modules read LocalStorage while others write IndexedDB.

### Stage E — Controlled cutover
- Only after all parity and regression tests pass: add the v250 repository to the app entry point and switch the app's read/write paths in a controlled release.
- Keep LocalStorage unchanged and available for rollback.
- Require an explicit user-approved backup and cutover.
- Test reload, close/reopen, offline behavior, update flow, invoice numbering, project P&L, accounting, reports, print/PDF, language and restore.
- Do not publish to the production repository until the user explicitly authorizes it.

## 6. Cutover blockers / open items

- [ ] User confirms safe export of the v250 legacy snapshot JSON.
- [ ] Obtain/verify exact 40-key inventory metadata; current notes do not certify every key name.
- [ ] Inspect the complete source call-site inventory, including dynamic keys and Storage prototype instrumentation.
- [ ] Decide and document typed record schemas and migration version.
- [ ] Implement converter with conflict detection and parity report.
- [ ] Complete async refactor of all LocalStorage paths.
- [ ] Complete regression and recovery tests.
- [ ] Obtain explicit approval before any app cutover or production publication.

## 7. Files and boundaries

- `storage-repository.js`: actual v250 repository; database `the_handyman_accountancy_v250_idb`.
- `storage-v250-legacy-migration.js`: exact, non-destructive LocalStorage capture bridge.
- `storage-v250-legacy-migration-lab.html`: manual stage/inspect/snapshot UI.
- `storage-foundation.js`: older test226 database; not the v250 target.
- `index.html`: remains unchanged during this audit. Its current SHA is `f6bdb6a31fd9e424ca0464b5fb725c4ad0fb2315`.

No app cutover, LocalStorage deletion, production change, or new test branch is authorized by this specification.
