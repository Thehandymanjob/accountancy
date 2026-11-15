# The Handyman Accountancy — IndexedDB Migration Manifest

- Baseline: approved v250 test application
- Repository: `Thehandymanjob/accountancy-test`
- Working branch: `release239` (existing branch only)
- Production repository/branch: `Thehandymanjob/accountancy` / `main` — out of scope
- Status: design and mapping specification; **not an execution authorization**
- Data authority: approved complete-user-data backup v6 only
- Backup file SHA-256: `07b6170db9169e3b59d0b4527b88e26d589bd18c178ec9a1b1975b55f403db90`

## 1. Safety invariants

1. Do not read old LocalStorage namespaces as migration sources or merge them into the approved v6 data.
2. Do not write to, clear, rename, or delete any existing LocalStorage key during design, staging, or validation.
3. Do not modify `Final_backup.json` or the approved v6 backup.
4. Do not reuse or overwrite `the_handyman_accountancy_test226`, `the_handyman_accountancy_roundtrip_v6`, or any other existing database.
5. Use a new isolated database name for the v250 migration work: `the_handyman_accountancy_v250_idb`.
6. Keep the application on its current storage adapter until the complete read/write parity test passes and a separate explicit cutover approval is received.
7. Work only in the existing `release239` branch. No new branches and no production changes.
8. Every write stage must be idempotent or have a verified rollback. No cleanup/deletion phase is part of this manifest.

## 2. Approved backup v6: observed structure

Backup root keys: `app`, `backupType`, `version`, `exportedAt`, `data`, `projects`, `contracts`.

- `app`: The Handyman Accountancy
- `backupType`: `complete-user-data`
- `version`: 6
- `exportedAt`: `2026-11-07T08:35:24.557Z`
- `data` keys: `entries`, `customers`, `invoices`, `customExpenseCategories`, `settings`, `thirdPartyTransactions`
- `projects` keys: `projects`, `workers`, `partners`, `contractors`, `companies`, `companyJobs`, `profile`, `current`, `guide`, `currentSubproject`, `profitReportProjectId`
- `contracts`: array

Observed normalized counts from the approved backup:

| Domain | Count |
|---|---:|
| customers | 1 |
| projects | 8 |
| invoices | 2 |
| contracts | 0 |
| accounting entries | 22 |
| project receipts | 9 |
| project expenses | 1 |
| workers | 1 |
| partners | 1 |
| contractors | 1 |
| companies | 1 |
| company jobs | 0 |
| custom expense categories | 1 |
| third-party transactions | 0 |
| accounting settings | 1 |
| project metadata | 1 |
| record-order metadata | 1 |
| embedded images | 8 |

These are backup-v6 observations, not counts from the current browser's LocalStorage or the existing test IndexedDB.

## 3. Proposed target database and stores

Database: `the_handyman_accountancy_v250_idb`.

The existing v233 foundation currently creates a different database (`the_handyman_accountancy_test226`) and schema version 4. It must not be silently repointed or reused. Build a new, explicitly named foundation/configuration for this migration.

| Target store | Source in approved v6 | Mapping rule / notes |
|---|---|---|
| `customers` | `data.customers[]` | Preserve each record and stable ID exactly. |
| `invoices` | `data.invoices[]` | Preserve invoice number, customer/project references, nested items, dates, status, payment fields and unknown fields. |
| `accountingEntries` | `data.entries[]` | Preserve all fields and IDs; do not recalculate amounts or rewrite dates. |
| `accountingSettings` | `data.settings` | One settings record; retain all keys and values. |
| `customExpenseCategories` | `data.customExpenseCategories[]` | Preserve original values and order; assign deterministic storage IDs only if source entries have no IDs, with source index retained. |
| `thirdPartyTransactions` | `data.thirdPartyTransactions[]` | Preserve all fields and IDs. |
| `projects` | `projects.projects[]` | Preserve projects, subprojects, financial values, relationships, photos and unknown fields. |
| `projectReceipts` | nested project receipt/ledger data | Extract only after exact source field/path has been confirmed; preserve parent project and subproject IDs. |
| `projectExpenses` | nested project expense/ledger data | Extract only after exact source field/path has been confirmed; preserve parent project and subproject IDs. |
| `workers` | `projects.workers[]` | Preserve IDs and all fields. |
| `partners` | `projects.partners[]` | Preserve IDs and all fields. |
| `contractors` | `projects.contractors[]` | Preserve IDs and all fields. |
| `companies` | `projects.companies[]` | Preserve IDs and all fields. |
| `companyJobs` | `projects.companyJobs[]` | Preserve IDs and all fields. |
| `contracts` | root `contracts[]` | Preserve as records; approved v6 currently contains zero. |
| `projectMetadata` | `projects.profile` and workspace state | Preserve profile/logo and workspace selectors separately from project records. |
| `recordOrder` | source ordering and invoice sequence metadata, if present in v6 | Do not infer a sequence from stale LocalStorage. Derive only from validated backup records and explicit v6 metadata. |
| `auditLog` | migration audit events | New migration audit only; do not import unrelated legacy logs. |
| `legacySnapshots` | exact approved v6 source snapshot | Store immutable raw backup snapshot and SHA-256 metadata; never use old browser keys as source snapshots. |
| `kv` | application metadata / compatibility values | Only non-record metadata with an explicit schema; not a catch-all for core business records. |

**Important mapping gate:** the current count summary reports project receipts and expenses, but the exact nested field paths and ownership rules must be confirmed from the v6 JSON before implementing normalized extraction. Do not invent a mapping or split records based on guessed field names.

## 4. Application state requiring an explicit v7 backup policy

The v6 backup does not show dedicated root fields for the following app state. Their availability in v6 is therefore not established:

- Monitor activity log and diagnostics
- Report archive, report settings, report workflow and report email settings
- Report notifications
- Language preference and preference-version marker
- Help/contact drafts
- Invoice sequence cleanup markers and reset markers
- Factory-reset recovery snapshot
- Other future app preferences and UI state

These are not to be sourced from old LocalStorage namespaces. Before v7 is finalized, define which of these are user data worth preserving, which are disposable diagnostics, and which are safely reconstructable from approved v6 records. Do not silently claim they were migrated from v6.

## 5. Schema and identity rules

- Preserve source IDs exactly when valid and unique within their target store.
- Never silently drop malformed records or duplicate IDs. Stop the batch, report exact store/index and issue, and require a deliberate resolution.
- Do not generate replacement IDs during a production data migration without a documented mapping table linking original source position/value to generated ID.
- Preserve unknown object fields, nulls, empty strings, zero values, nested arrays and object structure.
- Preserve array ordering using explicit order metadata where the application depends on it.
- Preserve image data exactly at first migration. Do not resize, recompress, or convert image formats.
- Keep parent-child relationships explicit; validate every project/subproject and invoice/customer reference.
- Amounts are stored as provided. No currency conversion, rounding, price normalization, or recalculation during migration.

## 6. Required migration phases

| Phase | Action | Writes allowed? | Exit condition |
|---|---|---|---|
| M0 | Freeze baseline and verify approved backup SHA-256 | No | Exact source file and branch baseline recorded |
| M1 | Finalize field-level source-to-target mapping from v6 | No | Every field/path mapped or explicitly excluded |
| M2 | Create isolated database and schema | New DB only | Correct DB name/version/store list; existing DBs untouched |
| M3 | Stage immutable v6 snapshot | New DB only | Raw bytes/hash and metadata read back exactly |
| M4 | Import typed records in bounded transactions | New DB only | No dropped/duplicate IDs; all transaction writes verified |
| M5 | Reconcile all stores and relationships | Read-only | Exact counts, IDs, canonical payload equality, image hashes and totals |
| M6 | Exercise app repository adapters in isolated harness | New DB only | CRUD, reload, backup/restore and failure tests pass |
| M7 | Full app storage cutover in test branch | Only after explicit approval | App reads and writes IndexedDB exclusively; no hidden LocalStorage fallback |
| M8 | Browser regression and recovery tests | Test DB only | iPhone Safari reload/offline/large images/backup/restore pass |
| M9 | Production release | Only after separate explicit approval | Not included in current authorization |

## 7. Mandatory acceptance tests

1. SHA-256 of immutable staged backup snapshot equals approved source SHA-256.
2. Every imported store has exact expected record count.
3. Every record ID set matches the source mapping; no silent skips.
4. Canonical JSON equality for every source payload/record, except explicitly documented storage envelope fields.
5. All image payload hashes match; all 8 embedded images accounted for.
6. All project and subproject links resolve.
7. All invoice/customer links resolve.
8. Accounting totals and project receipt/expense totals match source without recalculation.
9. Invoice numbering remains monotonic and no duplicate invoice numbers are introduced.
10. Backup export from IndexedDB can be restored into a second isolated test database and round-trips exactly.
11. Simulated quota error, transaction abort, reload during operation and interrupted migration leave source backup intact and target marked incomplete.
12. Test app does not write business data to LocalStorage after cutover; any remaining LocalStorage usage is explicitly documented and limited to non-persistent runtime necessities.
13. The app never reports a successful save until the IndexedDB transaction commits and read-back verification succeeds.

## 8. Current known blockers / facts

- The v250 `index.html` still reads and writes core Accounting, Projects and Contracts through LocalStorage.
- Report workspace, language preferences, monitor log, invoice sequence, support drafts, recovery and related helpers also use LocalStorage directly.
- The existing IndexedDB foundation is isolated and does not automatically back the app.
- Existing accounting/project migration modules are prototypes, not an application cutover.
- The current test IndexedDB has earlier test artifacts and must not be treated as the approved v6 staging database.
- The separate v6 roundtrip database has already passed an isolated roundtrip test and must not be overwritten or deleted.
- The source-reconciliation browser report is still pending; it is useful for understanding current test environment only, not for choosing migration source data.

## 9. Current authorization boundary

Authorized now: documentation and read-only inspection; creation of isolated test-only code on `release239` when separately appropriate.

Not authorized by this manifest: modifying production `main`, changing live app persistence, importing data into a live app database, deleting LocalStorage, clearing IndexedDB, overwriting existing databases/backups, or releasing a cutover.

---
Generated as a working specification. This document records observed facts separately from proposed design and unresolved mappings.


## 10. Field-level inspection of approved backup v6 (completed)

The approved JSON was inspected directly. Its top-level structure is exactly:
`app`, `backupType`, `version`, `exportedAt`, `data`, `projects`, `contracts`.

### Accounting payload

`data` contains exactly:
- `entries[]`: 22 records. Observed entry fields include `id`, `type`, `date`, `amount`, `method`, `category`, `reference`, `notes`, `invoiceId`, `createdAt`.
- `customers[]`: 1 record. Observed fields: `id`, `name`, `phone`, `address`, `workAddress`, `email`.
- `invoices[]`: 2 records. Observed fields include `id`, `number`, `date`, `customerId`, `customerName`, `phone`, `billingAddress`, `workAddress`, `description`, `qty`, `unitPrice`, `vat`, `status`, `notes`, `historical`, `paymentStatus`, `paymentDate`, `paymentMethod`, `items[]`, `updatedAt`. Nested item fields must be preserved as-is.
- `customExpenseCategories[]`: 1 string value (not an object record).
- `settings`: object with `businessName`, `ownerName`.
- `thirdPartyTransactions[]`: 0 records.
- Root `contracts[]`: 0 records.

### Projects payload

`projects` contains:
- `projects[]`: 1 project record.
- `workers[]`, `partners[]`, `contractors[]`, `companies[]`: 1 record each.
- `companyJobs[]`: 0 records.
- `profile`: object with `businessName`, `ownerName`, `phone`, `email`, `logo`, `paymentDetails`.
- `current`: project ID string.
- `guide`: language string (`en`).
- `currentSubproject`: null.
- `profitReportProjectId`: project ID string.

The single project has fields:
`id`, `name`, `customer`, `address`, `phone`, `price`, `contract`, `partnerId`, `share`, `notes`, `photo`, `status`, `created`, `income[]`, `expenses[]`, `wages[]`, `tools[]`, `food[]`, `materials[]`, `hasSubprojects`, `subprojects[]`, `partnerShare`, `contractors[]`.

There are 7 subprojects. Each carries its own ID, name, price and one or more ledger/category arrays; observed keys include `income`, `expenses`, `wages`, `tools`, `food`, `materials`, and `photo`. Preserve every subproject as a nested child or as a normalized row with an explicit `projectId` and stable `subprojectId`; never flatten away its parent relationship.

### Confirmed project ledger mapping

The backup has 9 receipt/income rows and 1 expense row, all nested under subprojects:

| Parent subproject | Income rows | Expense rows |
|---|---:|---:|
| Roof (first) | 4 | 1 |
| Top floor | 2 | 0 |
| Porch roof | 1 | 0 |
| Plumbing | 1 | 0 |
| Roof (second) | 1 | 0 |
| Basement | 0 | 0 |
| Bathroom | 0 | 0 |
| **Total** | **9** | **1** |

The project-level ledger arrays (`income`, `expenses`, `wages`, `tools`, `food`, `materials`) are empty in this backup. All nine receipt records and the single expense must therefore be traced to their owning subproject during normalization.

Observed receipt fields vary. Examples include `id`, `description`, `amount`, `date`, `method`, `reference`, `receiptType`, and `receiptImage`. Observed expense fields include `id`, `date`, `amount`, `description`, `reference`, `category`, `contractorId`, and `contractorName`. Preserve optional/missing fields and empty strings exactly; do not force all records into one narrowed schema.

Observed totals for this backup only:
- Subproject receipt amount total: £12,200.
- Subproject expense amount total: £280.
- These totals are reconciliation checks, not values to write back over the project price or ledger records.

### Image accounting correction

There are **8 image payloads in total**:
- 1 project profile logo (`projects.profile.logo`).
- 1 main project photo (`projects.projects[0].photo`).
- 6 non-empty subproject photos (the Basement photo is an empty string).

The prior description of “8 embedded images” is correct only when the profile logo is included. The project workspace itself has 7 non-empty photos (main project + 6 subprojects). Each image must be hashed and verified at its original path; empty photo strings remain empty strings.

### Required mapping decision before implementation

The source backup stores receipts and expenses nested inside subprojects. The existing typed target stores `projectReceipts` and `projectExpenses` use `id` as keyPath. Normalization is permissible only if each child row retains:
- original child `id`;
- `projectId`;
- `subprojectId`;
- original category/ledger type;
- original row payload without field loss.

The parent project record must also retain the original nested arrays or a byte/canonical-equivalent representation until the complete normalized round-trip is proven. Avoid dual-write ambiguity: designate one canonical representation and document a deterministic rehydration function before app cutover.

**Unresolved:** the application’s actual runtime calculations and edit/delete flows must be checked to determine whether they expect nested arrays as canonical storage. Until that code-path review is complete, keep the project object intact in the staging payload; do not make normalized child stores the only source of truth.



## 11. Runtime project persistence review: canonical model decision

The v250 application source was inspected at the actual project load/save boundary:

- `prLoad()` reads the complete Projects workspace object from `tha_test226_projects_v1`.
- `prPersist()` serializes and writes the complete `prDB` workspace object.
- The workspace object contains `projects[]`, and each project contains its own subprojects and nested ledger arrays.
- Project load-time compatibility logic iterates over each project and its subprojects; it mutates a cloned candidate and commits only after verification.
- The application's project editing and reporting logic is therefore built around the complete nested workspace object, not around independently loaded receipt/expense tables.

**Decision for first cutover:** keep the complete Projects workspace payload as the canonical record in IndexedDB (one envelope under a dedicated `kv` key, or a single workspace record with exact JSON preservation). Do not make `projects`, `projectReceipts`, or `projectExpenses` the only canonical representation during the first migration.

Typed child stores may be populated later as verified secondary indexes/projections, but only if:
1. each row carries its original ID, project ID, subproject ID and ledger type;
2. a deterministic projection/rebuild process exists;
3. the application continues to use one authoritative canonical workspace;
4. projection writes are atomic with the canonical workspace update, or can be safely rebuilt;
5. projections are checked against the canonical nested payload and are never independently edited.

This avoids a dangerous dual-source-of-truth condition in which an edit changes a normalized receipt but leaves the nested project ledger stale (or vice versa).

The approved backup v6 therefore maps as follows for the first safe import:
- Preserve the entire `projects` root object exactly, including `current`, `guide`, `currentSubproject`, `profitReportProjectId`, `profile`, nested ledgers and all images.
- Preserve the entire `data` root object exactly, including accounting arrays, settings, custom categories and third-party transactions.
- Preserve the root `contracts[]` exactly.
- Keep a separately hashed immutable copy of the complete backup JSON.

The above is a source-preserving import design. It does not yet establish that the live app has been switched to IndexedDB; that requires replacing every persistence call site and testing all user workflows.


## 12. Full v250 index.html LocalStorage call-site inventory

A source scan of the complete v250 `index.html` (647,160 characters; blob SHA `f6bdb6a31fd9e424ca0464b5fb725c4ad0fb2315`) found **93 direct LocalStorage method call expressions** across the application source. These are call expressions, not 93 separate data domains; several are repeated within transactional restore/reset/rollback routines.

The file contains 17 distinct literal `tha_test226_*` storage keys:

1. `tha_test226_accounting_v1`
2. `tha_test226_projects_v1`
3. `tha_test226_contracts_v1`
4. `tha_test226_monitor_log_v1`
5. `tha_test226_invoice_sequence_v1`
6. `tha_test226_invoice_sequence_cleanup_v1`
7. `tha_test226_empty_invoice_sequence_reset_v229`
8. `tha_test226_app_language_v1`
9. `tha_test226_app_language_pref_version_v1`
10. `tha_test226_report_archive_v1`
11. `tha_test226_report_notifications_v1`
12. `tha_test226_report_settings_v1`
13. `tha_test226_report_workflow_v1`
14. `tha_test226_report_email_settings_v1`
15. `tha_test226_help_contact_drafts_v1`
16. `tha_test226_factory_reset_recovery_v1`
17. `tha_test226_isolation_test_record_cleanup_v1`

### Call-site groups confirmed in source

| Area / function group | Observed responsibility | Migration requirement |
|---|---|---|
| `loadDB`, `persist` | Accounting payload read/write and read-back check | Replace with awaited repository calls; preserve existing integrity lock and save-failure UI. |
| `updateMainExpenseFields` | Reads project contractor directory while creating accounting expense | Read from canonical project workspace repository. |
| `reportArchiveLanguage`, `currentAppLang`, language initialization/save | Reads/writes language and preference version | Persist in app settings; retain exact fallback and language validation behavior. |
| `has`, `syncLauncherBrand`, `ctProfile` | Reads project workspace/profile and logo | Read canonical project workspace; preserve image bytes and fallback behavior. |
| `backup` | Reads accounting, project and contract payloads to build backup | Export one consistent IndexedDB snapshot, not a mixture of live in-memory and stale browser storage. |
| `restore`, `safeWrite`, `mergeById` | Multi-domain restore, rollback and merge operations | Implement one atomic multi-store transaction or a staged import with verified rollback; preserve current duplicate/merge semantics only after explicit test coverage. |
| `factoryResetFinalConfirm` | Saves recovery snapshot and removes/reset multiple data keys | Must become an explicit transaction with a recoverable pre-reset snapshot; no LocalStorage deletion after cutover. |
| `removeKnownIsolationTestRecord` | Removes a known test-only record marker | Keep strictly test-only; do not let it touch business records. |
| `cleanupUncommittedInvoiceNumbers`, `resetStaleSequenceOnlyWhenNoSavedRecords`, `highestSharedRecordNumber`, `reserveRecordNumber` | Invoice number allocation, cleanup and consistency | Serialize number reservation to avoid duplicates across tabs; preserve issued numbers and cleanup audit semantics. |
| `updateInvoiceStatusDiagnostic`, `removeOrphanedInvoiceIncome` | Invoice/accounting cross-record consistency | Move into coordinated repository operations; validate both sides before commit. |
| `prLoad`, `prPersist`, `prSaveProject`, `prToggleProjectCompletion`, `prRestore` | Projects workspace load/save, completion status and restore | Canonical whole-workspace repository; await commit before showing success or refreshing dependent views. |
| `ctRead`, `ctWrite` | Contract list load/save with rollback | Repository adapter must retain validation, exact previous-value rollback and success flag semantics. |
| Help-contact draft handlers | Saves local-only support drafts | Preserve draft state in IndexedDB; continue to label as not sent. |
| `monitorReadLog`, `monitorWriteLog`, `monitorContext`, `exportDiagnosticReport`, `runMonitorSelfCheck` | Diagnostic event log, storage status and exported diagnostics | Store monitor data separately from business ledger; diagnostics must not make core saves fail. Self-check must test IndexedDB, not LocalStorage. |
| Wrapped `persist` monitor hook | Compares before/after accounting snapshots for activity logging | Replace snapshot reads with repository snapshots; do not report save success before transaction commit. |
| Report helper `load` / `save` | Generic report archive/settings/workflow/email/notification persistence | Identify each caller and key; route all through typed report/app-settings repository methods. |

### Important cross-domain behavior

- Invoice sequence logic is not merely a preference: it coordinates invoice numbering and accounting entries. Number reservation must be concurrency-safe and transactionally consistent.
- Invoice status changes and orphaned invoice-income cleanup touch both invoice and accounting records; separate independent writes risk partial updates.
- Backup and restore cover accounting, projects and contracts as a group. A cutover cannot be considered complete if only ordinary save/load paths are migrated but backup/restore remains LocalStorage-based.
- Factory reset has a recovery snapshot dependency. The reset and its recovery point must be designed together.
- Monitor logging is used by storage failure handling itself. Avoid recursive failure loops: monitor failure must never conceal or overwrite the original business-data save error.
- The app has runtime in-memory state (`db`, `prDB`) as well as persistent state. Repository calls must be asynchronous and UI success must wait for transaction completion/read-back, not merely update in-memory objects.

### Remaining audit boundary

This scan covers the monolithic `index.html`. Before claiming the whole application is free of direct LocalStorage access, inspect every separately loaded JavaScript file and any inline scripts added by service worker/update infrastructure. Also search for bracket notation, aliases such as `const storage = localStorage`, and indirect helper wrappers. The current finding is **93 direct method-call expressions in index.html**, not a proof that the complete deployed origin has no other access.


## 13. External script and storage-foundation audit

The `index.html` file loads two external JavaScript files:

- `version-manager.js` (SHA `39da652c2cec49d62b4b45236d2a40a8db411540`): zero direct LocalStorage method calls found.
- `storage-foundation.js` (SHA `63cffe890c6aacc860eb696deeb33a555a4eb66f`): five direct LocalStorage reads found. They are in legacy inventory/snapshot and migration helper paths (enumerating same-origin keys, reading a legacy snapshot source, and capturing source values). The module also provides IndexedDB operations.

The foundation's legacy LocalStorage reads are not ordinary app persistence, but they remain a potential path to old browser data. For the final cutover:
- Keep migration/snapshot functionality behind an explicit, separately invoked migration mode.
- Do not run generic all-key enumeration or import every key as business data.
- Do not use legacy values as authoritative data when v6 is the approved source.
- After migration acceptance, the normal application runtime must not invoke LocalStorage migration helpers.
- Any retained legacy snapshot utility must be read-only, explicitly scoped, and unavailable to normal save/load flows.

No other external JavaScript files are referenced directly by the current `index.html`. This audit does not yet cover scripts dynamically injected at runtime, browser extensions, or hosting-level service worker behavior; those are separate deployment checks.


## 14. Central Storage Repository design (v250)

### Design objective

Introduce one asynchronous persistence boundary for the application. UI/business modules must not call `localStorage` or IndexedDB directly. They call repository methods, and the repository owns transactions, serialization, integrity checks, schema versioning and error reporting.

### Architecture layers

1. **UI / business logic** — forms, project calculations, invoice numbering, report screens. No direct browser-storage API.
2. **Domain repositories** — Accounting, Projects, Contracts, Reports, Preferences, Diagnostics, Recovery. These preserve the existing domain payload shapes initially.
3. **Central Storage Repository** — asynchronous `read`, `write`, `remove`, `transaction`, `snapshot`, `restore` methods. It is the only module allowed to open the application IndexedDB.
4. **IndexedDB adapter** — database lifecycle, schema upgrades, transaction completion/abort, request handling and quota/error normalization.
5. **Migration adapter (temporary, isolated)** — imports the approved v6 backup only. It must not be called by ordinary app startup or save flows.

### Canonical storage model for first cutover

To minimize schema conversion risk, first cutover preserves the complete current application payload shapes as canonical records:
- Accounting: one canonical payload envelope retaining `entries`, `customers`, `invoices`, `settings`, `customExpenseCategories`, `thirdPartyTransactions` and any future fields.
- Projects: one canonical workspace envelope retaining `projects`, nested subprojects/ledgers, `workers`, `partners`, `contractors`, `companies`, `companyJobs`, `profile`, selected project/subproject and other workspace state.
- Contracts: one canonical list/payload envelope.
- Report state: separate envelopes for archive, settings, workflow, email settings and notifications.
- Preferences: language, preference version and invoice-sequence metadata in explicit namespaced records.
- Diagnostics: monitor events in a dedicated store/envelope with bounded retention.
- Recovery: immutable recovery snapshots with timestamps, reason, schema version and content hash.
- Support drafts: separate list/envelope; continue to state clearly that drafts are local and not transmitted.

Do not normalize projects or accounting into row-per-entity stores in the first cutover. That is a later optimization, only after behavior parity and an explicit schema migration plan. The original payload is the source of truth.

### Proposed repository contract

All methods are asynchronous and return explicit success/error results; no method reports success before transaction completion.

- `ready()`: open/validate database and schema.
- `get(domain, key)`: read one namespaced record; return a deep JSON value or null.
- `put(domain, key, value, options)`: serialize, commit, read back and verify exact canonical equality.
- `remove(domain, key, options)`: delete one record and verify absence.
- `transact(domains, callback)`: atomic multi-store transaction for cross-domain operations. Callback must only use transaction-scoped requests; no unrelated awaits or network calls.
- `snapshot(domains)`: return a consistent snapshot from one readonly transaction.
- `restore(snapshot, options)`: stage and verify all records, then commit atomically; preserve pre-restore snapshot until success.
- `health()`: return database name, schema version, store counts, quota/error state if available, and migration status without exposing personal payloads.

Namespacing prevents collisions: records are keyed by stable strings such as `accounting/main`, `projects/workspace`, `contracts/main`, `reports/archive`, `preferences/language`, `preferences/invoice-sequence`, `diagnostics/monitor-log`, `recovery/latest`, and `support/drafts`.

### Transaction boundaries

The following operations must be atomic across the related records:
- Invoice creation plus invoice-number reservation.
- Invoice payment/status change plus corresponding accounting income entry.
- Invoice deletion/cleanup plus removal or reconciliation of linked income entries.
- Project save plus any required project metadata updates.
- Contract restore/merge plus its canonical contract payload.
- Full backup restore across Accounting, Projects and Contracts.
- Factory reset recovery snapshot plus reset marker/state.

Monitor logging is best-effort and must not be allowed to abort a successful business-data transaction. If monitor logging fails, preserve the original operation result and surface a separate diagnostics warning.

### Async conversion requirement

Existing functions such as `persist()`, `prPersist()` and `ctWrite()` are synchronous. They cannot simply be redirected to IndexedDB while keeping their current return contract. Every caller that depends on immediate boolean success must be converted to `async/await` and must wait for transaction completion. UI buttons should prevent duplicate submissions while writes are in flight, show saving state, and only display success after commit and verification.

A compatibility shim that returns `true` before IndexedDB commits is prohibited. A LocalStorage fallback after an IndexedDB failure is also prohibited after cutover because it creates split-brain storage and hides data loss risk.

### Schema and upgrade policy

- New isolated DB name: `the_handyman_accountancy_v250_idb`.
- Keep the existing experimental `the_handyman_accountancy_test226` database and completed `the_handyman_accountancy_roundtrip_v6` database untouched.
- Use a dedicated versioned schema and explicit object-store creation. Do not modify the existing foundation's DB name or version in place.
- Include stores for canonical domain envelopes, immutable backup snapshots, migration audit and schema metadata. Add typed projection stores only when justified.
- Every schema upgrade must be additive or have a verified transform and rollback plan. Never delete a store containing user data as part of an upgrade.
- Record schema version and app data schema version separately.

### Migration / startup state machine

The app must not silently migrate on first page load. Use explicit states:
`not-started` → `backup-verified` → `staged` → `validated` → `cutover-approved` → `idb-active`.

If any validation fails, stop and leave the old source untouched. The app must clearly show which store is active and which version is loaded. Do not auto-promote a staged database.

### Acceptance gate before app integration

Before changing `index.html`:
1. Repository unit tests pass against synthetic data in the isolated DB.
2. Exact round-trip preserves null, empty string, zero, booleans, nested arrays, unknown fields and image data.
3. Atomic transaction tests prove all-or-nothing behavior across Accounting, Projects and Contracts.
4. Concurrency test proves two simultaneous invoice reservations cannot return the same number.
5. Quota/abort/blocked-upgrade tests fail safely without reporting success.
6. Reload test proves committed data persists and incomplete staging is not mistaken for active data.
7. Backup export and restore round-trip exactly.
8. App adapter contract is documented for every current synchronous caller before converting UI flows.

**Current status:** design is recorded; no repository module has yet been connected to the app, no new browser database has been created by this work, and no app data has been written or moved.


## 15. First isolated repository adapter and manual test harness

Created on the existing `release239` branch:

- `storage-repository.js` — standalone asynchronous IndexedDB repository adapter.
- `storage-repository-lab.html` — manual test page; does not load the accountancy app.

Adapter database:
`the_handyman_accountancy_v250_idb`, schema version 1.

Initial API:
- `ready()`
- `get(domain, key)`
- `put(domain, key, value)`
- `remove(domain, key)`
- `transact(writes)` — atomic multi-record write in one object-store transaction
- `snapshot(domains)`
- `restore(snapshot)`
- `health()`
- `selfTest()`

The initial adapter stores canonical JSON payload envelopes. It does not normalize business entities and does not call the old storage foundation. Its source contains no direct LocalStorage API calls. The only supported way to initialize it is through an explicit call from the manual test harness; loading the accountancy app does not load or initialize it.

The manual test harness is:
`https://thehandymanjob.github.io/accountancy-test/storage-repository-lab.html`

The test button uses synthetic records only and checks basic initialization, exact JSON round-trip (including zero, empty string, null, false, nested arrays and unknown fields), batch writes, snapshot/restore, and cleanup. The health button reads record counts only.

**Not yet tested in a real browser:** no user-side run result has been received. Therefore the module is considered an initial prototype, not accepted production-ready storage. It has not been added to `index.html`, and it does not import the approved backup v6. Running the lab creates the new isolated IndexedDB database; do not run it until ready to perform this separate synthetic test.


## 16. Repository prototype correction — empty snapshot restore

- Commit: `b7741a39291d70b3b565b8cf71dc4d227d7a9cea`
- Corrected `restore(snapshot)` so a valid snapshot containing zero records returns a successful no-op result (`written: 0`) rather than failing because the generic transaction API requires at least one write.
- Added an explicit `emptySnapshotRestore` assertion to the repository self-test.
- This is a repository-only change on `release239`. It does not modify `index.html`, connect the app to IndexedDB, access LocalStorage, import backup v6, or touch production.
- Browser execution is still pending; code change and test assertion do not constitute a passed browser test.


## 17. Domain-exact snapshot restore and expanded isolation tests

- Commit: `5040949bc2c0ae633e6793920e649ca6dc3ff7b8`
- Changed `restore(snapshot)` from write-only behavior to exact replacement within the snapshot's declared domains: existing records in those domains are removed and snapshot records are written in one IndexedDB read-write transaction.
- Records outside the declared domains are preserved. Snapshot validation rejects invalid/duplicate domains, invalid keys, duplicate record IDs, and records outside the declared domain list.
- Added self-test assertions for removal of stale records, preservation of unrelated domains, and empty-snapshot clearing of its declared domain.
- This is still isolated repository work on `release239`; no app integration, LocalStorage migration, backup import, production update, or cutover.
- Browser test of this new behavior is pending. The previously reported six passing checks apply to the preceding implementation, not this new change.


## 18. Follow-up hardening after code review

- `543f34a75c2f5d469b2e89d09043d52ab9598293`: corrected the stale-record test fixture so the snapshot is captured before the stale record is inserted; this makes the test actually prove stale-record removal.
- `ea352f88bcc092bfbaf9ab1b18b34f657f5aa56f`: added independent concurrent-write coverage and preflight protection against overwriting reserved synthetic test keys.
- `7d4f35d82f635bdc59dc69c6d2898eef5982963f`: added snapshot database identity validation and expanded preflight/cleanup checks for every synthetic key used by the self-test.
- The current self-test now includes concurrent independent writes, exact-domain replacement, stale-record removal, unrelated-domain preservation, empty-domain clearing, and refuses to overwrite pre-existing test keys.
- Browser execution of these latest changes is pending. Earlier six-check browser success does not validate these new changes.


## 19. Browser validation of hardened repository prototype — passed

The user executed the current cache-busted manual lab in the browser and returned this result:

```json
{
  "ok": true,
  "database": "the_handyman_accountancy_v250_idb",
  "schemaVersion": 1,
  "checks": {
    "ready": true,
    "roundTrip": true,
    "atomicBatch": true,
    "concurrentWrites": true,
    "snapshotRestore": true,
    "restoreRemovesStaleRecords": true,
    "restorePreservesOtherDomains": true,
    "emptySnapshotRestore": true,
    "cleanup": true
  },
  "localStorageAccessed": false,
  "appCutover": false
}
```

### Interpretation

- All nine repository self-test checks passed in the user's browser.
- The tested database was `the_handyman_accountancy_v250_idb`, schema version 1.
- The lab reports that it did not access LocalStorage.
- The lab explicitly reports `appCutover: false`; the accountancy app is not connected to this repository and no app storage migration has occurred.
- This validates the isolated repository prototype's tested behaviors only. It does not validate iPhone Safari app workflows, production data import, full application adapter integration, backup-v6 import, or cutover.

### Next engineering gate

Proceed with a read-only adapter contract and call-site integration plan for the v250 app. Before changing `index.html`, enumerate every caller that must become asynchronous and define transaction boundaries and regression tests. Keep the repository lab isolated. Do not import backup v6, change LocalStorage, modify production, or perform cutover without separate explicit approval.
