# v250 IndexedDB Integration Plan — Read-only Call-site Review

- Repository: `Thehandymanjob/accountancy-test`
- Branch: `release239` (existing branch only)
- Application baseline: v250
- Reviewed source: `index.html` blob `f6bdb6a31fd9e424ca0464b5fb725c4ad0fb2315`
- Repository adapter: `storage-repository.js` blob `4d4479376ecf2581cbdf4326aa37bf1d289ed448`
- Scope: source review and integration contract only
- Status: **no application code changed; no app cutover; no backup imported**

## 1. Important clarification about transaction scope

The current repository schema uses one object store, `records`, plus `metadata`. Business domains are namespaced records inside `records`; they are not separate IndexedDB object stores.

Therefore the first-cutover target does **not** need a multi-object-store transaction to atomically update Accounting, Projects and Contracts. It needs one IndexedDB read-write transaction on `records` that atomically updates all relevant domain envelopes.

The current `transact(writes)` can atomically write a non-empty list of records in that one store. However, it currently has no transaction-scoped read/modify/write API, conditional update, or deliberate abort test. The existing self-test's `atomicBatch` proves a successful batch write, not rollback after an injected failure and not concurrent invoice-number allocation.

## 2. Current source facts

### Application startup

- `loadDB()` reads the Accounting envelope synchronously from LocalStorage.
- `prLoad()` reads the Projects workspace synchronously from LocalStorage.
- Startup then runs invoice-sequence cleanup/reset, assigns numbers to existing income records, removes orphaned invoice-linked income records, ensures invoice fields, and performs additional persistence.
- These startup steps currently depend on synchronous in-memory state and storage return values.

**Integration consequence:** the app needs an asynchronous bootstrap barrier. The UI must not enable editing, invoice creation, project operations, reports, or backup until the canonical IndexedDB envelopes have been loaded and validated. Startup repairs must be explicitly classified and persisted only after validation; they must not run against empty defaults when IndexedDB is unavailable.

### Main synchronous persistence APIs

| Existing function | Occurrences in `index.html` | Current role | Required conversion |
|---|---:|---|---|
| `persist()` | 18 | Accounting write + read-back + success/error UI | Convert function and all dependent callers to `async`; await repository commit and read-back before reporting success. |
| `prPersist()` | 30 | Whole Projects workspace write + read-back + recovery lock | Convert all callers and event handlers to await; preserve previous workspace on failure. |
| `ctWrite()` | 3 | Contract list write + validation + rollback | Convert callers to await; store the full canonical Contracts envelope. |
| `ctRead()` | 6 | Contract read and validation | Replace with async repository read; retain corruption/recovery lock behavior. |

The occurrence counts are source-text matches in the reviewed v250 file, including definitions and calls; they are not a count of unique UI workflows.

### Cross-domain and critical workflows

| Workflow / functions | Data touched | Required repository behavior |
|---|---|---|
| Invoice creation and numbering: `reserveRecordNumber()`, `nextSharedRecordNumber()`, invoice submit handlers | Accounting envelope, invoice sequence metadata | Atomic read/modify/write inside one read-write transaction. Two tabs must never reserve the same number. A plain sequence `get()` followed by `put()` is unsafe. |
| Invoice payment/status and linked income: invoice status handlers, `updateInvoiceStatusDiagnostic()`, `removeOrphanedInvoiceIncome()` | Accounting envelope containing invoices and entries | Update both arrays in the same canonical Accounting envelope and commit once. Diagnostics must read the repository, not LocalStorage. |
| Full backup: `backup()` | Accounting, Projects, Contracts, app metadata | Take one consistent snapshot of all included canonical envelopes; do not combine stale in-memory state with separately read persistent records. |
| Full restore: `restore()`, `safeWrite()`, `mergeById()` | Accounting, Projects, Contracts | Validate and prepare all payloads first, then atomically replace/merge all declared envelopes in one repository transaction. Retain existing merge semantics only after tests prove them. |
| Project workspace: `prLoad()`, `prPersist()`, `prSaveProject()`, project editing and subproject flows | Complete Projects workspace | Keep the full nested workspace as canonical. Do not split project/subproject ledgers into separately authoritative records during first cutover. |
| Project completion: `prToggleProjectCompletion()` | Projects workspace | Use awaited repository write; show success only after commit. Preserve the current rule that completion toggle itself does not create/sync financial entries. |
| Project restore: `prRestore()` | Projects workspace | Validate before write; replace one canonical envelope atomically; preserve recovery lock and restore failure behavior. |
| Contracts: `ctRead()`, `ctWrite()` and their callers | Contracts envelope | Validate shape and IDs before write; await durable commit. |
| Contractor picker: `updateMainExpenseFields()` | Projects workspace contractors | Read from the canonical Projects envelope or already validated in-memory workspace; remove direct LocalStorage read. |
| Factory reset: `factoryResetFinalConfirm()` | Accounting, Projects, Contracts, invoice sequence, recovery snapshot | First commit an immutable recovery snapshot and reset marker atomically. Do not delete LocalStorage as part of the IndexedDB cutover. Reset requires a separate explicit user confirmation and dedicated tests. |
| Diagnostics: `monitorReadLog()`, `monitorWriteLog()`, `monitorContext()`, `logMonitorEvent()` | Monitor envelope | Best-effort, bounded retention. Monitor failure must never turn a successful business transaction into a failed save or hide the original error. |
| Language: `currentAppLang()`, `applyAppLanguage()`, `reportArchiveLanguage()` | Preferences | Load preferences during async bootstrap, then apply language before exposing the app. Preserve language validation and current preference-version behavior without startup LocalStorage writes. |
| Reports: report archive/settings/workflow/email/notifications helpers | Separate report envelopes | Inventory each key and caller; persist each named report domain through repository methods. |
| Support drafts | Support draft envelope | Preserve local-only/not-sent status; do not silently discard on storage migration. |

## 3. Canonical domain envelope map

Keep the first migration source-preserving and minimal:

| Domain | Record key | Canonical payload |
|---|---|---|
| `accounting` | `main` | Entire Accounting object: entries, customers, invoices, settings, custom categories, third-party transactions and unknown fields. |
| `projects` | `workspace` | Entire Projects workspace: projects, nested subprojects/ledgers, directories, profile/images and workspace selectors. |
| `contracts` | `main` | Complete contract array/payload. |
| `preferences` | `main` | Explicitly defined language and invoice-sequence metadata; preserve unknown preference fields only when sourced from an approved backup or deliberately migrated under a documented rule. |
| `reports` | named keys | Archive, notifications, settings, workflow and email settings as distinct records. |
| `diagnostics` | `monitor-log` | Bounded monitor events; not part of business-ledger atomicity. |
| `support` | `drafts` | Local support drafts. |
| `recovery` | unique snapshot key | Immutable recovery snapshot and metadata. |
| `migration` | named state keys | Migration status, source hash, schema/app-data version and audit metadata. |

Do not create row-per-invoice/project/receipt stores in the first cutover. The complete Accounting and Projects envelopes remain the sole authoritative representations.

## 4. Repository API gaps to close before app integration

The browser-passed prototype currently exposes `ready`, `get`, `put`, `remove`, `transact(writes)`, `snapshot`, `restore`, `health` and `selfTest`.

Before app integration, add and test:

1. **Transaction-scoped read/modify/write:** a safe API for reading and updating the invoice sequence and canonical envelopes within the same active read-write transaction. Do not implement this as separate `get()` and `put()` calls.
2. **Atomic multi-domain envelope commit:** a named helper or validated transaction wrapper that writes Accounting + Projects + Contracts envelopes together in the single `records` object store.
3. **Abort/rollback test:** deliberately abort after scheduling multiple writes and prove that none of the envelopes changed.
4. **Concurrent sequence reservation test:** run competing reservations and prove unique, monotonic numbers.
5. **Transaction lifecycle hardening:** avoid arbitrary asynchronous gaps inside an IndexedDB transaction. Queue requests while the transaction is active; resolve only on transaction completion; test on iPhone Safari.
6. **Snapshot consistency:** snapshot all required envelopes from one readonly transaction and restore them atomically.
7. **Failure semantics:** normalize quota, abort, blocked-upgrade and unavailable-storage errors; never return success before transaction completion and read-back.
8. **Bootstrap/readiness contract:** expose a single `openAndValidate()`/bootstrap operation that verifies schema and required envelopes before the UI is unlocked.
9. **No fallback contract:** after an explicitly approved cutover, IndexedDB failure must stop writes and show a clear recovery error; never write to LocalStorage as fallback.

### Serialization constraints

The adapter uses JSON serialization. This preserves JSON values such as null, false, zero, empty strings, nested objects/arrays and image data URLs. It does not preserve JavaScript-only values such as `undefined`, functions, Date instances, Map/Set, Blob objects or cyclic references as such. The approved v6 payload is JSON; any app runtime values must be converted to a documented JSON representation before persistence. Do not silently coerce fields during migration.

## 5. Additional audit findings and discrepancy to resolve

- A fresh scan of the reviewed `index.html` confirms 93 direct LocalStorage method-call expressions.
- The same scan also found additional `window.localStorage` references and possible alias declarations; the final no-LocalStorage audit must inspect these, bracket notation and indirect wrappers rather than relying only on direct method-call count.
- A fresh scan of `storage-foundation.js` found 8 LocalStorage method-call expressions, whereas the earlier manifest section 13 recorded 5. This count discrepancy must be reconciled by classifying each occurrence as migration-only, inventory-only, or normal-runtime access before any cutover claim.
- `version-manager.js` has zero direct LocalStorage method-call expressions in the reviewed file.
- `storage-repository.js` itself has no LocalStorage calls and is not loaded by the app's `index.html`.

## 6. Required implementation order

1. Finish the complete storage-access audit across `index.html`, both external scripts, inline/dynamic scripts and aliases.
2. Extend and test repository transaction primitives in the isolated lab only.
3. Write a domain adapter layer with no UI changes and no app import of backup data.
4. Convert startup to an asynchronous bootstrap in a separate test-only integration step.
5. Convert Accounting, Projects and Contracts persistence APIs and every caller; use static checks to ensure no synchronous boolean assumptions remain.
6. Convert invoice numbering, invoice/payment cross-record logic, backup/restore and factory reset with explicit transaction tests.
7. Convert report/preferences/monitor/support persistence.
8. Run automated/static regression checks, then user-side iPhone Safari workflow tests on the test app.
9. Only after complete parity, separately request approval for importing the approved v6 backup into a new isolated app database.
10. Only after successful reconciliation and separate explicit authorization, consider app cutover. Production remains a separate approval gate.

## 7. Safety boundary

This review did not change `index.html`, `storage-repository.js`, the lab, LocalStorage, any browser database, the approved backup, or production. It did not import data or perform cutover. Continue only on existing `release239`; do not create a branch.

## 8. Isolated transaction primitive implementation — browser validation passed

Implemented on the existing `release239` branch:

- Repository module latest commit: `15875e80ab799d03f7dd517c293d1f0ebd28aa18`; blob SHA `f5d4c5d8e16361c3f7479840cd28c8aa57a453b4`.
- Lab latest commit: `07f53817e501a1dda08ed161ca161890a03306f7`; blob SHA `5831e0596e3f83c50ef74f86ec877a2a56d9dea1`.
- Repository build: `repo-selftest-20261107-02`.
- Lab build: `lab-selftest-20261107-02`.
- Added `mutate(operations)`: transaction-scoped read/modify/write callbacks for multiple namespaced records in one read-write transaction on the `records` store.
- Added `reserveCounter(domain,key,minimum)`: atomically reserves the next integer using `mutate`.
- The self-test covers multi-domain mutation, deliberate abort/rollback, concurrent writes and counter reservations, snapshot/restore, stale-record removal, preservation of unrelated domains, empty-domain restore, and cleanup.
- The concurrent mutation verification was hardened to avoid a false failure when a later valid transaction commits before an earlier transaction's post-commit read-back. The test separately verifies the final counter and uniqueness/monotonicity of reservations.
- The lab enforces exact expected build IDs and refuses to report success if checks are missing or the loaded module does not match the expected build.

### Browser validation evidence

The user ran the lab in iPhone Safari and returned the complete output:

- `ok: true`
- All 12 expected checks were `true`.
- `missingChecks: []`
- `missingOrFailedChecks: []`
- `unexpectedChecks: []`
- `localStorageAccessed: false`
- `buildMatches: true`
- `reportComplete: true`
- `appCutover: false`

This closes the isolated repository-primitive validation stage only.

### Important test boundary

These are synthetic repository tests, not live app workflows. They do not prove the current invoice-number business rules, Accounting/Projects synchronization, app backup/restore, app startup, or Safari application integration. No application file is imported or modified by this test. No backup was imported; no LocalStorage key was read or changed; no app cutover occurred.

## 9. Next stage — complete source audit before application integration

The repository primitive stage is passed. The next permitted work is a read-only, exhaustive audit of the current v250 application source and its dependencies, followed by a revised integration specification.

1. Reconcile all LocalStorage access sites in `index.html`, `storage-foundation.js`, and any dynamically loaded/inline scripts. Include direct calls, aliases, bracket notation, indirect wrappers, reads, writes, deletes and startup side effects.
2. Classify every access as core business data, preferences, reports, diagnostics, support drafts, migration/backup/restore, recovery, or disposable test instrumentation.
3. Trace each persistence function to all callers and event handlers. Record which callers currently assume synchronous return values and the async conversion required.
4. Identify every multi-record business operation and specify its atomic envelope(s), failure handling, user-visible success timing and recovery behavior.
5. Reconcile the v6 approved backup mapping with the canonical envelope model. Do not infer missing auxiliary data from stale browser storage.
6. Define the asynchronous bootstrap barrier, schema validation, no-fallback behavior, read/write parity gates and browser test matrix.
7. Do not edit `index.html`, connect the app to the repository, import v6, modify LocalStorage, or perform cutover during this audit stage.

The application source remains unchanged at blob SHA `f6bdb6a31fd9e424ca0464b5fb725c4ad0fb2315`. The repository module is still not referenced by `index.html`. Work remains limited to the existing `release239` branch; production `main` and all existing user data remain out of scope.


## 10. Read-only application storage audit — pass 1 (inventory and workflow tracing)

Reviewed the unchanged v250 application source and its two loaded support scripts on `release239`:

- `index.html`: blob `f6bdb6a31fd9e424ca0464b5fb725c4ad0fb2315`, 647,160 characters.
- `storage-foundation.js`: blob `63cffe890c6aacc860eb696deeb33a555a4eb66f`, 39,463 characters.
- `version-manager.js`: blob `39da652c2cec49d62b4b45236d2a40a8db411540`, 18,094 characters.

### Static inventory (source-text counts; not unique workflows)

| Source | Direct LocalStorage method-call expressions | Other observations |
|---|---:|---|
| `index.html` | 93 | 6 `window.localStorage` references; 13 declarations assigning a LocalStorage expression to an alias; no `indexedDB` reference. |
| `storage-foundation.js` | 8 | 7 LocalStorage alias declarations/references in migration, inventory and verification helpers; 3 IndexedDB references. |
| `version-manager.js` | 0 | No direct LocalStorage or IndexedDB references in this source scan. |

The counts overlap conceptually: a direct method call may also be included in an alias-containing function. They must not be added together as if they were independent data paths. No bracket-notation `['localStorage']` access was found in these three files by the initial pattern scan. Dynamic evaluation, computed aliases and external browser extensions are outside this source-only inventory.

### Application workflow map from traced functions

| Area | Current functions / behavior | Migration requirement |
|---|---|---|
| Accounting bootstrap | `loadDB()` reads the Accounting JSON envelope synchronously. | Replace with validated async read before UI readiness; preserve integrity-error lock. |
| Accounting persistence | `persist()` writes and reads back the Accounting envelope synchronously; callers use boolean success/failure. | Convert definition, all callers and event handlers to await durable commit. Do not display success or render dependent state before commit. |
| Invoice sequence | `highestSharedRecordNumber()`, `reserveRecordNumber()`, `cleanupUncommittedInvoiceNumbers()`, `resetStaleSequenceOnlyWhenNoSavedRecords()`. | Sequence reservation and envelope updates must share a transaction. Startup cleanup must not run against defaults or before validated canonical data is loaded. |
| Invoice lifecycle | Create/update/delete, payment status, diagnostic and orphan cleanup paths call `persist()`; some flows also update invoice-linked accounting entries. | One canonical Accounting envelope commit per logical operation; restore prior in-memory state on abort; audit every event handler for ignored return values. |
| Projects | `prLoad()` and `prPersist()` synchronously load/save the whole nested workspace; many project, subproject, worker, partner, company and job handlers depend on boolean return values. | Keep the entire workspace envelope canonical; convert every caller to async and preserve rollback behavior. |
| Project/accounting sync | Startup cleanup and project-financial sync helpers can update Accounting data after inspecting project records. | Define exact cross-domain transaction boundary and ensure no partial Accounting/Projects update. Preserve existing business rules; do not infer new synchronization. |
| Contracts | `ctRead()` / `ctWrite()` synchronously read, validate, write and verify the contract list; save/delete/render paths call them. | Async read/write with integrity lock and commit confirmation before success. |
| Full backup/restore | `backup()` reads Accounting, Projects and Contracts from separate synchronous storage calls; `restore()` validates and writes/removes multiple keys with rollback helpers. | Replace with one consistent multi-envelope snapshot and one atomic validated restore; preserve current merge/replace semantics only after explicit regression tests. |
| Factory reset | `factoryResetFinalConfirm()` snapshots/recovery-reads and removes several app keys. | Separate recovery snapshot and reset marker transaction; do not remove or mutate legacy LocalStorage during migration/cutover. Keep explicit confirmation and test rollback. |
| Preferences/language | `currentAppLang()`, `applyAppLanguage()`, `reportArchiveLanguage()` read/write language and preference-version values. | Load and validate preferences during async bootstrap; do not write defaults before canonical data validation. |
| Reports | `refreshReport()`, report archive/settings/workflow/email/notification helpers read report settings and language. | Inventory report keys and all call sites; assign explicit repository domains and decide which values are included in a future complete backup. |
| Monitoring/diagnostics | `monitorReadLog()`, `monitorWriteLog()`, `monitorContext()`, self-check and diagnostic export use LocalStorage. | Best-effort bounded diagnostics; diagnostic write failure must not fail business saves. Exclude synthetic self-test data from user migration. |
| Support | `submitHelpContact()` stores support/contact draft state. | Preserve draft semantics and sent/not-sent state; classify whether it belongs in user backup v7. |
| Launcher/profile | `syncLauncherBrand()`, `ctProfile()` and project profile helpers access persisted profile data. | Resolve canonical owner of profile/logo; avoid duplicated authoritative copies. |

### Critical synchronous assumptions confirmed

The source has 18 textual occurrences of `persist(` (including its definition), 30 of `prPersist(` (including its definition), and 3 of `ctWrite(` (including its definition). Existing callers use synchronous truthy/falsy branches, and some calls intentionally ignore the result. This means replacing storage calls alone is unsafe: all callers, event handlers, startup sequencing, and dependent render/alert actions need coordinated async conversion.

Startup currently calls `loadDB()`, then isolation cleanup and invoice-sequence cleanup/reset routines, then `prLoad()`, followed by additional project/accounting synchronization and launcher setup. The async bootstrap must gate all these operations and classify each startup repair before it is allowed to persist.

### Remaining audit work (not yet complete)

1. Resolve every one of the 13 `index.html` LocalStorage aliases and all 7 `storage-foundation.js` alias declarations to the exact underlying operation and classify read/write/delete/inventory/verification.
2. Enumerate all report, preferences, monitor and support key constants and trace every reader/writer.
3. Trace every `persist()`, `prPersist()` and `ctWrite()` call to its enclosing function/event callback, including ignored return values and rollback branches.
4. Review all dynamic script creation/imports and any storage access through computed property names or wrappers.
5. Reconcile the eight `storage-foundation.js` accesses individually with the earlier manifest's count and label each migration-only, inventory-only or normal-runtime.

No app code, LocalStorage value, browser database, backup or production branch was changed by this audit. The repository adapter remains unreferenced by the app. Continue only on `release239`; do not import v6 or perform cutover during this audit.


## 11. Storage-key and alias audit — pass 2

### Application keys identified in `index.html`

The source contains 17 distinct literal keys in the `tha_test226_*` namespace. This list is a source-code inventory, not evidence that every key currently exists in the user's browser:

| Key | Initial classification | Migration treatment |
|---|---|---|
| `tha_test226_accounting_v1` | Core Accounting envelope | Canonical `accounting/main`; v6 is the approved source for migration. |
| `tha_test226_projects_v1` | Core Projects workspace | Canonical `projects/workspace`; v6 approved source. |
| `tha_test226_contracts_v1` | Core Contracts envelope | Canonical `contracts/main`; v6 currently has an empty contract array. |
| `tha_test226_invoice_sequence_v1` | Business sequence metadata | Must be reconciled from validated invoice/income records and explicit approved metadata; never import stale browser value. |
| `tha_test226_invoice_sequence_cleanup_v1` | Startup cleanup marker | Reconstruct/redefine under repository schema; do not treat as user business data. |
| `tha_test226_empty_invoice_sequence_reset_v229` | Startup/test reset marker | Legacy implementation marker; do not migrate as authoritative data. |
| `tha_test226_isolation_test_record_cleanup_v1` | Isolation-test cleanup marker | Disposable test instrumentation; exclude from user data migration. |
| `tha_test226_app_language_v1` | User preference | Include only under explicit preferences/v7 policy; v6 does not establish its value. |
| `tha_test226_app_language_pref_version_v1` | Preference migration/version marker | Recreate using a documented preference schema; not a user-data source. |
| `tha_test226_monitor_log_v1` | Local diagnostics/activity log | Best-effort diagnostics; retention and backup policy required; do not source from stale LocalStorage. |
| `tha_test226_report_archive_v1` | User report archive | Dedicated report envelope; determine whether archive is user data and whether v7 backup includes it. |
| `tha_test226_report_notifications_v1` | Report notification state | Dedicated report envelope; define expiry/retention and backup policy. |
| `tha_test226_report_settings_v1` | Report preferences/configuration | Dedicated report envelope; preserve only from a specifically approved source. |
| `tha_test226_report_workflow_v1` | Report workflow state | Dedicated report envelope; define recovery and backup policy. |
| `tha_test226_report_email_settings_v1` | Report recipient configuration | Sensitive operational preference; preserve only through explicit v7 scope and consent. |
| `tha_test226_help_contact_drafts_v1` | Support/contact drafts | Preserve pending-local-only drafts if user data policy requires; never treat as sent. |
| `tha_test226_factory_reset_recovery_v1` | Recovery snapshot | Do not migrate as active business data; retain a separate immutable recovery design and explicit restore path. |

### LocalStorage alias resolution

The 13 application aliases are not 13 additional stores. They resolve to:

- `raw` in `loadDB()`: raw Accounting JSON read.
- `lang` in report language lookup: language preference value.
- `rawAccounting`, `rawContracts`: pre-restore source snapshots for Accounting and Contracts.
- `check`: value read-back inside `safeWrite()` during restore.
- `checkDB`: restore verification after rollback/write sequence.
- `raw` in invoice diagnostic: Accounting envelope read for invoice cross-check.
- `raw` in `prLoad()`: Projects workspace read.
- `oldRaw` in project restore: prior Projects raw payload for rollback.
- `checkRaw` in `ctWrite()`: Contracts write read-back.
- `ok` in monitor self-check: temporary diagnostic test value.
- `prefVersion`, `saved` in language bootstrap: preference-version and selected-language reads.

The seven `storage-foundation.js` aliases are local variables holding enumerated keys or raw values during legacy inventory, snapshot, migration and verification. They are not independent normal-runtime app data flows.

### Exact classification of the eight storage-foundation calls

| Function | Calls | Classification | Boundary |
|---|---|---|---|
| `enumerateLegacyKeys()` | `localStorage.length`, `localStorage.key(i)` | Migration inventory | Reads key names only; does not write or delete. |
| `snapshotLegacyData()` | `getItem(key)` | Migration snapshot | Reads legacy values into an explicit snapshot; not approved as a source for this v250 migration. |
| `migrateLegacyData()` | `getItem(key)` | Migration operation | Reads legacy values before staging them into the foundation KV store; prohibited as a source for the approved v6 migration. |
| `verifyMigration()` | `getItem(key)` | Migration verification | Compares legacy values to staged KV values; read-only verification, not canonical app runtime. |
| `inspectStorageInventory()` | `length`, `key(i)`, `getItem(key)` | Diagnostic inventory | Reads key names and value metadata for local diagnostic output. |
| `inspectMigrationSources()` | `length`, `key(i)`, `getItem(key)` | Diagnostic inventory/reconciliation | Reads all current-origin keys for a local diagnostic; not an approved migration source. |

Thus the eight direct call expressions are accounted for as migration/inventory/verification helpers in this file, not as the app's canonical runtime persistence adapter. However, these helpers still access LocalStorage and must be disabled, isolated or explicitly retained as read-only diagnostic tools after cutover; they cannot be allowed to silently migrate old keys into the new canonical database.

### Additional dynamic interception behavior

The application includes a LocalStorage method wrapper that observes selected `setItem` and `removeItem` operations and records monitor events for non-exempt keys. This means a final audit cannot rely only on direct source call counts: it must review patched prototype methods and ensure IndexedDB operations are not routed through a LocalStorage compatibility shim. The wrapper must be removed or made strictly diagnostic and non-authoritative after cutover.

### Audit status

Pass 2 has identified all 17 literal app namespace keys and assigned initial treatment, resolved all 13 `index.html` aliases, and classified the eight `storage-foundation.js` direct access expressions by function. The next pass must trace report module read/write helpers and all callers of the synchronous persistence functions, including ignored return values. This is still a read-only audit; no application source or user data has been changed.


## 12. Persistence call-site audit — pass 3

### Call-site inventory

A source-level trace of the three synchronous persistence helpers found the following call sites (the helper definitions are excluded from the counts):

- `persist()`: 17 call sites in addition to its definition.
- `prPersist()`: 29 call sites in addition to its definition.
- `ctWrite()`: 2 call sites in addition to its definition.

These are call-expression counts, not a count of unique business workflows; several functions contain multiple branches or repeated call sites.

### Accounting persistence — `persist()`

The helper is called by entry create/edit/delete, settings save, customer create/delete, invoice create/update/delete, invoice paid/unpaid transitions, invoice-number assignment, project-to-accounting synchronization, project-sync removal, startup cleanup and test-marker cleanup.

Callers that explicitly inspect success and either roll back in-memory changes or defer UI success include `saveEntry`, `deleteEntry`, `saveSettings`, `clearAll`, `saveCustomer`, `deleteCustomer`, `saveInvoice`, `deleteInvoice`, `assignNumbersToExistingInvoices`, `saveInvoicePaidPayment`, `markInvoiceUnpaid`, `prSyncOneProjectFinancials` and `prRemoveProjectSync`.

Two unsafe/ambiguous patterns were confirmed:

1. `printInvoice()` changes a paid draft invoice to issued, calls `persist()` without checking the result, and proceeds to render the print view. With asynchronous IndexedDB this must await a committed save; on failure it must not present the status change as saved.
2. Startup cleanup calls `persist()` after removing orphan invoice income and later performs additional direct LocalStorage writes. The cleanup currently ignores the save result. Startup repair must become part of a validated bootstrap transaction and the UI must remain blocked until commit succeeds.

The test-isolation cleanup helper conditionally checks `persist()` if it removed a synthetic row, but then writes its LocalStorage completion marker independently. Both actions must be removed from ordinary runtime migration or replaced with a non-authoritative, namespaced diagnostic mechanism.

### Projects persistence — `prPersist()`

The helper has a broad set of project workflows: contractor/company/job/package management, project create/delete, project and subproject finance rows, project completion/synchronization, unified costs, people directories, profile/logo changes, project restore and project detail navigation.

Most save workflows check the return value and either restore their previous in-memory state or avoid showing success. However, the following sites ignore the result and therefore cannot be mechanically converted by changing `prPersist` to return a Promise:

- `prOpenProject()`: changes current project/subproject selectors, calls `prPersist()` without checking, then navigates to project detail.
- `prDeleteRow()`: deletes a project-ledger row, calls `prPersist()` without checking, then rerenders as if saved.
- `prDeletePerson()`: deletes a worker/partner from the directory, calls `prPersist()` without checking, then rerenders and refreshes selectors.
- Legacy startup project-sync cleanup near the end of the main script calls `persist()` conditionally only when it detects a change, but ignores the result and continues startup.

Other project callers already contain explicit failure branches, including `prSaveProject`, `prSaveSubFinanceRow`, `prAddSubproject`, `prSaveSubprojectEdit`, `prEditUnifiedCost`, `prDeleteUnifiedCost`, `prSaveRow`, `prSavePerson`, and the company-job payment workflow. Their rollback coverage still needs review for every mutated nested object and selector.

### Contracts persistence — `ctWrite()`

There are two application callers: `ctSave()` and `ctDelete()`. Both check the result before updating the UI. The current helper performs write, read-back validation and a best-effort rollback synchronously. The IndexedDB replacement must preserve validation and make the caller await the transaction's committed outcome; rollback should be transaction-level rather than a second compensating write.

### Report module persistence

The report module defines generic `load(key,fallback)` and `save(key,value)` wrappers over LocalStorage and loads four independent keys at initialization: report archive, notifications, settings and workflow. It also separately reads/writes report email settings. The save helper returns false on storage failure and displays an inline warning, but the audit still needs to trace every `save()` caller to establish whether each caller checks the boolean before reporting success or advancing workflow state. These report records are not included in approved backup v6; they require a separately approved v7 auxiliary-data scope.

### Conversion implications

The app currently depends on synchronous mutation followed by a synchronous boolean result. A Promise-returning repository adapter cannot be substituted in place. Each workflow needs an explicit asynchronous sequence:

1. validate inputs and construct a candidate state without exposing success;
2. submit the complete required domain mutation (or multi-domain transaction) to the repository;
3. await transaction completion;
4. only then commit in-memory state, update the UI and emit success/monitor events;
5. on failure, preserve or reload the last committed state and show a recovery-safe error.

For operations currently mutating shared objects before calling persistence, a shallow reference rollback is insufficient when nested arrays/objects have already been mutated. Prefer immutable candidate envelopes or a pre-mutation structured clone, with tests for nested project ledgers, invoice-linked entries and project/accounting synchronization.

### Audit status

Pass 3 confirms that the main risk is not just the persistence helper implementation: several business functions assume synchronous completion, and at least five paths ignore persistence results (invoice print status, startup orphan cleanup, project open selector persistence, project ledger-row deletion, and worker/partner deletion; the startup legacy sync cleanup is an additional ignored-result path). These must be fixed before the app can use IndexedDB as its sole canonical store. No app source, browser data, IndexedDB records, backup or production branch was changed in this pass.


## 13. Report storage and startup/event-order audit — pass 4

### Report module storage inventory

The report module is initialized from an inline module block near the end of `index.html`. It uses five LocalStorage keys:

- `tha_test226_report_archive_v1` — saved report HTML snapshots and metadata.
- `tha_test226_report_notifications_v1` — notification list/read state.
- `tha_test226_report_settings_v1` — period mode/configuration.
- `tha_test226_report_workflow_v1` — period completion and delayed review state.
- `tha_test226_report_email_settings_v1` — accountant recipient name/email.

Four keys are loaded at module evaluation through `load(key,fallback)`; email settings are loaded lazily when the email view is opened. Invalid JSON silently falls back to the supplied default in `load()`. That behavior is unsafe for authoritative user-owned report archives: malformed data must be surfaced as a protected/recovery state, not treated as an empty archive and later overwritten.

### All 11 report save call sites

| Function / action | Key | Checks save result? | Finding |
|---|---|---:|---|
| `report188SaveSettings` | settings | No | UI does not report a failed save. |
| `report188GenerateAndSave` | archive | Yes | Removes the newly prepended item from memory on failure; notification is created only after archive save. Notification save is deferred/unchecked. |
| `report188ToggleRead` | notifications | No | Renders after an unchecked save. |
| `report188OpenNotification` | notifications | No | Marks read, saves unchecked, then navigates. |
| `report188ToggleReadFromDetail` | notifications | No | Renders after an unchecked save. |
| `report188Open` | notifications | No | Marks report notification read, saves unchecked, then renders notifications. |
| `report188RenameStatus` | archive | No | Renders updated status even if persistence fails. |
| `report188ConfirmComplete` | workflow | No | Displays a successful completion message and creates notification after unchecked workflow save. |
| `checkDue` — flow update | workflow | No | Startup/manual reminder mutation may be reported complete although write fails. |
| `checkDue` — notification update | notifications | No | Same issue for generated reminders. |
| `report188SaveEmailSettings` | email settings | Yes | Success message only follows a true return from the helper. |

The report helper `save()` returns a boolean, but eight of the eleven call sites ignore it. In addition, `report188GenerateAndSave` checks the archive write but `addNotif()` only mutates the in-memory notification array; its durable save is not performed in that same checked sequence. A future repository implementation must save archive and related notification atomically where they form one user action.

### Report initialization and lifecycle ordering

The module schedules `report188Init()` using `setTimeout(...,0)` either from a `DOMContentLoaded` listener or immediately when the document is already parsed. A wrapper around the global `show()` function also schedules `report188Init()` whenever the report panel is opened. This can initialize the same module more than once; the initialization currently resets navigation state and runs `checkDue(false)` each time. It must become idempotent and await repository bootstrap before loading or mutating report state.

The report archive stores `node.outerHTML` snapshots. These are user-visible historical report artifacts and must be retained byte-for-byte/source-preservingly during any approved migration; they must not be regenerated from current accounting data as a substitute.

### Startup ordering and write hazards

The accounting bootstrap currently calls `loadDB()` and then runs multiple cleanup/normalization steps synchronously. It may call `persist()` after orphan cleanup without checking the result, and then performs repeated direct `localStorage.setItem(KEY, JSON.stringify(db))` writes around invoice field/number initialization. The Projects module is loaded later via `prLoad()`, then performs a legacy project-sync cleanup that may mutate Accounting and call `persist()` without checking the result.

This ordering is incompatible with an IndexedDB-only cutover. Required future startup sequence:

1. Open and validate the IndexedDB database/schema.
2. Load all canonical envelopes and auxiliary domains required by the UI.
3. Validate envelope shapes and backup/schema versions; do not silently replace corrupt data with defaults.
4. Run only explicitly approved, deterministic repair operations inside appropriate transactions.
5. Await commit and verify critical readback.
6. Publish loaded state to the UI and enable editing only after the bootstrap barrier resolves.
7. Initialize report module once, after the barrier; do not let timers or UI events race startup.

No startup cleanup may infer that a missing envelope means an empty account. No startup path may rewrite the canonical envelope merely because a field normalizer ran; only a detected, documented repair should produce a transaction.

### Additional direct-write workflows confirmed

- `prToggleProjectCompletion()` writes the Projects LocalStorage key directly rather than calling `prPersist()`; this bypasses the shared persistence helper and its monitoring/error semantics.
- `submitHelpContact()` stores local-only support drafts in a separate key. Its status correctly says the message was not sent. It needs a defined auxiliary-domain policy and must preserve the pending-local-only status.
- `prLoad()` performs an in-place legacy materials-to-expenses transformation and writes it back during startup. This is a migration/repair path, not ordinary runtime persistence; it must not execute against an unvalidated or empty IndexedDB workspace.
- `prRestore()` is a separate Projects-only restore workflow that reads the old LocalStorage value for rollback. It must be reconciled with the approved full backup/restore transaction and not remain a split-brain restore path after cutover.

### Pass 4 conclusion

The report module contains 11 save call sites, of which eight ignore the returned success/failure value. The module has a repeatable initialization path, silently defaults malformed report JSON, and stores historical HTML snapshots. Startup performs multiple unchecked/redundant accounting writes, project cleanup writes and a direct project completion write. These findings are blockers for an IndexedDB-only cutover. This pass was read-only: no application code, browser data, IndexedDB records, backup or production branch was changed.


## 14. Backup/restore, factory reset, invoice numbering and project/accounting synchronization audit — pass 5

### Complete backup (backup())

The current v6 exporter reads three LocalStorage payloads: Accounting (KEY / tha_test226_accounting_v1, or an in-memory db clone only when the key is absent), Projects (tha_test226_projects_v1), and Contracts (tha_test226_contracts_v1). It exports app, backupType, version 6, exportedAt, data, projects and contracts. It does not include report archive/settings/notifications/workflow/email settings, support drafts, monitoring log, language/preferences, factory-reset recovery snapshot, invoice sequence/cleanup markers or other auxiliary state. v6 is therefore the approved core user-data payload, not a complete image of every application-owned datum.

Accounting, Projects and Contracts are read sequentially from separate keys, so the export does not establish a consistent cross-domain snapshot boundary. A future IndexedDB exporter must read all canonical and approved auxiliary domains from one consistent readonly transaction/snapshot and preserve unknown fields and exact source payloads.

### Restore (restore(e))

Restore validates the file root, app/type, Accounting arrays/settings and required Projects/Contracts sections for a complete backup. It then transforms imported data in ways incompatible with source-preserving restore:

- Merges existing device companies and companyJobs into imported Projects, with existing-device items taking precedence on duplicate IDs/names. The result is device-dependent, not the supplied backup.
- Recalculates each parent project price from subproject agreed prices, potentially replacing the source value.
- Adds restoreReviewRequired and restoreReviewReason fields to contracts matching sample-content text.
- Builds Accounting using defaultDB() plus imported data and merges settings with defaults, potentially adding or normalizing fields.

It removes the three existing LocalStorage keys before writing replacements sequentially. Old raw strings and in-memory db are retained for best-effort rollback; basic readback is checked. This is not atomic across keys: interruption between writes can leave a partial restore before rollback executes. Projects-only prRestore() is a separate restore path with its own LocalStorage rollback and must be retired or routed through the same full restore transaction after cutover.

Required IndexedDB design: validate and stage every imported envelope without mutation; do not merge, recalculate, annotate or normalize user records; replace declared domains in one readwrite transaction. Preserve unprovided domains according to an explicit versioned restore policy. Verify transaction completion/readback before publishing state or success. Failure must leave all previous domains intact through transaction rollback, not compensating writes.

### Factory reset (factoryResetFinalConfirm())

The reset creates a recovery object containing app version, timestamp, raw Accounting, Projects, Contracts and invoice-sequence values, stores it under tha_test226_factory_reset_recovery_v1, and verifies those fields. It then removes Accounting, Projects, Contracts, invoice sequence and invoice-sequence cleanup marker, and verifies only the three main keys plus sequence are absent.

The recovery snapshot is retained, but the reset does not clear or snapshot report keys, support drafts, monitor log, language/preferences, other auxiliary keys or the empty-sequence reset marker. Existing semantics are a selective core-data reset, not a complete application-data reset. Before implementation, define whether IndexedDB reset preserves recovery history, monitoring, preferences, report archive and support drafts. Snapshot and delete the approved reset scope in one transaction; verify all declared domains. Do not silently broaden or narrow the current scope.

### Invoice numbering and lifecycle

The shared number is derived from the maximum of the LocalStorage high-water mark, invoice numbers and income-entry numbers. reserveRecordNumber(n) advances the high-water mark after invoice save/delete/legacy assignment, but its write is best-effort and does not return failure. highestSharedRecordNumber() and reservation operate outside the Accounting save transaction.

Startup separately runs cleanupUncommittedInvoiceNumbers(), resetStaleSequenceOnlyWhenNoSavedRecords(), assignNumbersToExistingIncome(), removeOrphanedInvoiceIncome(), ensureInvoicePaymentFields(), ensureInvoiceFields() and assignNumbersToExistingInvoices(), with repeated direct Accounting writes. The first cleanup resets the remembered sequence to the maximum current invoice/income number and writes a marker. The stale-sequence helper can set it to zero when no numbered records exist and writes another marker. Orphan cleanup may remove linked income, but its subsequent persist() result is ignored. Invoice-number backfill updates invoice numbers and linked income references; it checks persist() and rolls back those in-memory fields on failure, then reserves numbers individually after the Accounting write.

Invoice save and mark-paid/unpaid workflows update invoice plus linked income in one Accounting object and call persist(), rolling back in-memory state if it fails. However, sequence reservation follows the Accounting save, so it is not atomic with invoice/linked-income changes. A crash between steps can leave a saved number without a matching high-water mark; reservation can also fail silently.

Required IndexedDB design: keep the sequence counter in the same transaction as invoice create/update/delete and linked income changes. Reserve and collision-check atomically, including legacy backfill. Preserve the shared invoice/income number namespace and the rule that deleted invoice numbers remain reserved unless explicitly changed. Remove startup cleanup that can lower a valid high-water mark; reconciliation must never reuse a previously committed number. Do not reset to zero merely because current arrays are empty if historical reservations exist.

### Project/accounting synchronization

prSyncOneProjectFinancials(project) rebuilds generated Accounting entries and third-party rows from project/subproject ledgers, removes prior generated rows for that project, then calls persist(). prSyncAllProjectFinancials() loops projects and commits each separately; earlier projects can commit before a later project fails. The helper commits Accounting only; Projects is stored separately. Project completion status is written directly to the Projects LocalStorage key by prToggleProjectCompletion() and explicitly does not create/remove/sync financial entries. Legacy startup cleanup also removes generated project-sync rows and writes Accounting separately.

Required IndexedDB design: when a user action changes project ledger data and its generated Accounting representation, commit the full Projects workspace and Accounting envelope in one transaction. Rebuild affected generated rows deterministically and idempotently; preserve manual Accounting entries and unrelated project rows. Multi-project reconciliation must be one transaction or use an explicitly recoverable journal, never a partially synchronized set. Keep completion status separate from financial synchronization unless product requirements explicitly change.

### Pass 5 conclusion and scope

Current backup/restore is not a source-preserving round trip; factory reset covers selected core keys only; invoice numbering is not atomic with invoice data; and multi-project synchronization can partially commit. These are implementation blockers. The required design is a source-preserving, multi-domain IndexedDB transaction model with explicit auxiliary-data and reset policies.

This pass was read-only against application source and browser storage. Only this migration-plan document is being updated. No app code, LocalStorage data, IndexedDB records, backup files, production branch or branch structure was changed.


## 15. LocalStorage alias, indirect-access and foundation-call classification audit — pass 6

### Main application source: direct and indirect access

The current index.html has no executable IndexedDB integration. Its LocalStorage references are direct calls rather than a shared LocalStorage alias adapter. The targeted scan found no computed localStorage property access (localStorage[...]), window['localStorage']/window["localStorage"], or getItem/setItem/removeItem bound-function aliases. This narrows the alias risk but is not a substitute for a full JavaScript AST/data-flow audit; dynamically generated code and future script additions still require a final scan.

Direct application access remains distributed across the main Accounting load/save path, report language selection, contractor/profile/logo lookups, complete backup/restore, factory reset, isolation cleanup, invoice sequence and numbering, project bootstrap/persistence/completion/restore, support drafts, Contracts, monitoring/diagnostics, report module storage and app language preferences. These are runtime dependencies, not merely migration helpers. Existing direct writes in startup and the Projects material conversion remain particularly important because they bypass a single application repository boundary.

### Storage prototype instrumentation

index.html patches Storage.prototype.setItem and removeItem through installMonitorStorageHooks(). It retains original methods and invokes them, then logs writes/removals for same-origin LocalStorage except selected monitor/sequence/accounting keys. This is instrumentation around the browser storage API, not an application data adapter. It does not intercept getItem, clear(), direct property access, or IndexedDB. During migration it must not be mistaken for a persistence layer; its hooks must be removed or redesigned so diagnostic logging cannot create hidden runtime LocalStorage dependencies or interfere with the repository.

The monitor self-check also creates, reads and removes a temporary LocalStorage key. This is a diagnostic write, not user data, but it violates a strict no-LocalStorage runtime rule after cutover and must be replaced with an IndexedDB/repository health check or removed. The diagnostic report currently reads LocalStorage-backed app/project data and must be redesigned to inspect repository health without exposing raw user values.

### storage-foundation.js classification

storage-foundation.js is not wired into the current main app script list and remains an isolated prototype. Its LocalStorage operations fall into these classes:

1. **Legacy migration/source archival:** enumerateLegacyKeys() reads every same-origin key and explicitly includes four known core keys even when absent. snapshotLegacyData()/migration routines read raw legacy values, record snapshots and move/copy values into IndexedDB; verification compares the saved values against the source. These are migration-only operations and must run only in an explicitly authorized migration phase. The source values must remain untouched until a separately approved cutover and retention policy.
2. **Read-only inventory/diagnostics:** inspectStorageInventory() enumerates all same-origin LocalStorage keys, reads values only to compute byte length/JSON type, and reports metadata; inspectMigrationSources() reads all keys to compare digests and source/IndexedDB snapshots. These are diagnostic-only and must not run as ordinary app startup or post-cutover runtime paths. Their reports intentionally omit raw values, but still expose key names and metadata.
3. **No ordinary runtime persistence through LocalStorage:** foundation get/set/remove/keys APIs target the IndexedDB kv store; typed-record APIs target IndexedDB object stores. The module does not provide a LocalStorage-backed fallback. Its self-test writes only to its designated IndexedDB test namespace/stores and does not need LocalStorage migration.

The foundation's all-origin enumeration is broader than the four-item LEGACY_KEYS list. It can include report, language, monitoring, help-draft and unrelated same-origin keys. That breadth is useful for auditability but creates a privacy/scope concern: migration must not automatically import every same-origin key as canonical user data. Each key/domain needs an explicit classification and approved mapping; unknown/unrelated keys should be preserved in a source archive or left untouched, not silently promoted into app data.

### Remaining runtime key groups to resolve

The source confirms distinct persisted state beyond the three core envelopes: app language and preference-version keys; report archive, notifications, settings, workflow and email settings; monitor log; support-contact drafts; invoice sequence and cleanup markers; isolation-test cleanup marker; empty-sequence reset marker; factory-reset recovery snapshot; and project/accounting/contracts envelopes. These require an explicit v7 auxiliary-domain inventory and retention/backup/reset policy. Existing key-name pattern grouping in the foundation inventory is only heuristic; it must not be treated as authoritative domain mapping.

### Pass 6 conclusion

No LocalStorage alias adapter was found in the targeted scan, but the application still has numerous direct runtime reads/writes, prototype-level diagnostic instrumentation and LocalStorage-dependent self-checks. The foundation's LocalStorage access is migration/inventory-only, but it scans all same-origin keys and therefore needs strict scope control. This is a blocker to claiming IndexedDB-only operation. No app source, LocalStorage/browser data, IndexedDB records, backup, branch structure or production branch was changed in this pass; only this migration-plan document is being updated.


## 16. Persisted-key inventory and auxiliary-domain mapping — pass 7

### Confirmed application-owned LocalStorage keys

The source audit now identifies the following explicit persisted keys. These names are code-defined keys, not a claim that each key currently exists in a particular user's browser; runtime presence and byte counts require a separate read-only browser inventory.

| Key | Current content / role | Proposed IndexedDB domain | Backup / restore policy |
|---|---|---|---|
| tha_test226_accounting_v1 | Main Accounting envelope: entries, customers, invoices, settings and related fields | accounting/main | Required core envelope; preserve whole object and unknown fields |
| tha_test226_projects_v1 | Complete Projects workspace, profile and images | projects/workspace | Required core envelope; preserve nested project/subproject structure and unknown fields |
| tha_test226_contracts_v1 | Contracts array | contracts/main | Required core envelope; preserve array and all fields |
| tha_test226_invoice_sequence_v1 | Shared invoice/income number high-water mark | accounting/sequence | Required for number continuity; update atomically with invoice/income operations |
| tha_test226_invoice_sequence_cleanup_v1 | Legacy startup cleanup marker | migration/legacy-markers | Migration-only compatibility metadata; do not let it lower the sequence |
| tha_test226_empty_invoice_sequence_reset_v229 | One-time stale/empty sequence reset marker | migration/legacy-markers | Migration-only; never use as authority to reset a committed counter |
| tha_test226_isolation_test_record_cleanup_v1 | One-time marker for removal of a known test entry | migration/legacy-markers | Historical migration marker; do not run destructive cleanup against imported user data |
| tha_test226_factory_reset_recovery_v1 | Last factory-reset recovery snapshot (core envelopes and sequence) | recovery/factory-reset-snapshots | Preserve and verify; retain according to explicit recovery retention policy |
| tha_test226_report_archive_v1 | Saved report HTML snapshots and metadata | reports/archive | Preserve exact historical HTML and metadata; include in complete backup |
| tha_test226_report_notifications_v1 | Report notification list and read state | reports/notifications | Preserve in complete backup and restore |
| tha_test226_report_settings_v1 | Report period mode/configuration | reports/settings | Preserve in complete backup and restore |
| tha_test226_report_workflow_v1 | Period completion and delayed review/reminder state | reports/workflow | Preserve in complete backup and restore |
| tha_test226_report_email_settings_v1 | Accountant recipient name/email; email sending is not connected | preferences/report-email | Preserve as local preference; optionally exclude from portable/shareable exports only with explicit user-facing policy |
| tha_test226_monitor_log_v1 | Local diagnostic/activity events, capped at 2,500 | diagnostics/monitor-log | Separate opt-in/defined policy; include in local recovery snapshot only if user chooses; do not silently send externally |
| tha_test226_help_contact_drafts_v1 | Locally saved support messages with pending-local-only status | support/drafts | Preserve locally; include in full device backup only with explicit disclosure; never imply they were sent |
| tha_test226_app_language_v1 | Selected UI language | preferences/ui | Preserve and restore as a preference |
| tha_test226_app_language_pref_version_v1 | UI language preference migration/version marker | preferences/ui-metadata | Preserve or migrate through explicit preference schema versioning |

### Additional source-derived storage behavior

- The report module defines ARCH, NOTIFS, CFG and FLOW for archive, notifications, settings and workflow. It lazily reads the fifth email-settings key when the email view opens. The report module's generic load() silently substitutes defaults on malformed JSON; after migration, corrupted persisted report state must be surfaced as a protected/recovery condition rather than overwritten by defaults.
- Report archive records contain saved HTML snapshots (node.outerHTML) and metadata. These are historical records; do not regenerate them from current Accounting data during migration or restore.
- Support drafts are explicitly marked pending-local-only. The UI says they have not been sent. Preserve that status and do not transform them into sent support requests.
- Monitor log writes are capped to the latest 2,500 events. The current monitor self-check uses a temporary LocalStorage key, not a durable application key; after cutover it must use repository diagnostics and must not create a new LocalStorage item.
- Language initialization may overwrite language preference with English when the preference-version marker is not 204. This is a legacy preference migration rule, not a valid default for the new IndexedDB bootstrap. Preserve the stored value where valid and migrate the preference schema deliberately.
- The factory reset snapshot currently covers only Accounting, Projects, Contracts and invoice sequence. It does not contain the auxiliary domains listed above. The v7 policy must distinguish a core recovery snapshot from a complete-device recovery snapshot and make the choice explicit.

### Canonical domain policy for v7

Use source-preserving envelopes for Accounting, Projects and Contracts. Store sequence state with Accounting in the same transaction. Keep reports, preferences, diagnostics, support drafts, recovery snapshots and migration markers in separately named auxiliary domains. The auxiliary domains must not be merged into the core envelopes or silently discarded during core restore. Define restore modes explicitly (core user-data restore versus full device-state restore) and state which auxiliary domains are preserved, replaced or excluded in each mode. Factory reset scope must be independently defined and confirmed before implementation.

The confirmed key list is not yet a claim that the runtime inventory is exhaustive: computed keys, third-party scripts, browser storage outside LocalStorage, and keys present only in a particular device session remain to be checked. The existing foundation inventory can enumerate all same-origin LocalStorage keys without exposing values, but its output must be reviewed for unrelated-origin-app data before any mapping is approved.

### Pass 7 conclusion

The key-level inventory is now sufficiently concrete to define the initial v7 auxiliary-domain model, but not to authorize migration or reset. The next audit should trace all report/preferences/monitor/support read-write paths and confirm whether any additional keys are constructed dynamically or written by external scripts. No application code or browser data was changed; only this migration-plan document is being updated.


## 17. Auxiliary storage call-path and dynamic-script audit — pass 8

### Confirmed auxiliary read/write paths

- Report module: ARCH, NOTIFS, CFG and FLOW are loaded at module evaluation through a shared `load(key, fallback)` helper; `report188SaveSettings`, archive generation/status changes, notification read/open actions and workflow completion/reminder checks write through `save(key, value)`. Accountant recipient settings are loaded lazily when the email page is opened and saved by `report188SaveEmailSettings`. Email is not sent by this feature; it stores recipient details locally only.
- The generic report `load()` catches malformed JSON and returns a fallback. That is unsafe for authoritative archive/notification/workflow state: IndexedDB bootstrap must validate stored records and expose corruption/recovery status, not silently substitute an empty archive or default settings.
- `report188SaveSettings`, notification state changes, report status rename, workflow completion, and due/reminder updates do not consistently gate subsequent UI state on a successful save. `report188GenerateAndSave` checks archive save but notification creation is only mutated in memory in that path. IndexedDB conversion must make each logical action atomic (for example archive plus its report-ready notification) and render success only after commit.
- Language: `currentAppLang()` reads the preference-version marker and language; if version is not `204`, it writes English and the new marker. `setAppLanguage()` writes both keys, but applies the selected language even if persistence fails. Replace with a versioned preferences record and show success only after commit; do not carry forward the destructive default-to-English rule as an unconditional bootstrap migration.
- Support: `submitHelpContact()` reads and rewrites the whole local draft array. Invalid JSON silently becomes an empty list, risking loss on the next write. Store drafts as validated records in `support/drafts`; preserve `pending-local-only` and never imply that a draft was sent.
- Monitoring: `monitorReadLog()`/`monitorWriteLog()` read and replace the capped array. Diagnostic export reads the Projects LocalStorage envelope directly, and the self-check creates, reads and removes a temporary LocalStorage key. Move log writes to best-effort repository operations; diagnostics should use repository health and redacted metadata; remove the temporary LocalStorage self-check. Monitor failures must not abort business transactions.
- Project completion is a direct `localStorage.setItem(PR_KEY, JSON.stringify(prDB))` path, bypassing `prPersist()`. It must be converted to the same async repository commit path as all other Projects mutations.
- Additional direct read paths remain in contractor selection, financial report localization/logo rendering, launcher branding, contract profile rendering and diagnostic context. After cutover, these must read the canonical in-memory/bootstrap envelope or repository APIs; no module may independently parse a LocalStorage Projects copy.

### Dynamic scripts and indirect storage access

- Static scan of `index.html` found 96 textual `localStorage` occurrences, 26 `setItem(`, 57 `getItem(` and 11 `removeItem(` occurrences. These are source-expression counts, not independent workflows; repeated snippets and wrappers overlap.
- No `sessionStorage`, `import(`, `eval(`, `new Function`, or `localStorage.clear()` expression was found in this source scan. This is a targeted text scan, not a complete JavaScript AST/data-flow proof.
- Dynamic script element creation is present in PDF/export workflows. The observed dynamic loads fetch the external `html2pdf.js` library from cdnjs for financial reports, invoices and receipts; they are not observed loading an app storage adapter or an alternate application bundle. Generated print documents also contain their own embedded PDF-library loader. These external library loads are runtime dependencies for PDF features and should be audited separately for offline behavior/CSP, but they do not establish an IndexedDB integration path.
- `version-manager.js` is loaded as a static script near the end of the document. No dynamic `import()`/`eval()` storage adapter loader was found in `index.html`.
- The monitor patches `Storage.prototype.setItem` and `removeItem`. This instrumentation must be removed or redesigned before cutover; it must not intercept or observe normal storage writes after the app has moved to IndexedDB.

### Required implementation consequences

1. Create one awaited application bootstrap barrier. Load and validate core envelopes and explicitly selected auxiliary domains before enabling the UI or initializing report, language, monitor, support, Projects or Contracts modules.
2. Convert every auxiliary write path to asynchronous repository operations. Do not display saved/completed/updated status before transaction completion.
3. Use record-level support drafts and monitor events rather than read-modify-write whole arrays where appropriate; preserve the existing monitor cap as a retention policy, not a reason to overwrite unrelated domains.
4. Implement explicit corruption handling for report archive, support drafts and preferences. Never convert parse/read failures into empty arrays/defaults and then persist those defaults.
5. Audit PDF library loading independently; it is not a storage dependency, but PDF generation must not block bootstrap or trigger application LocalStorage access.
6. Run a final AST/data-flow scan and runtime instrumentation after integration. This pass is not proof that future third-party scripts or all computed keys are absent.

### Pass 8 conclusion

The remaining auxiliary storage call paths are now identified well enough to specify their conversion requirements. Important uncovered paths include direct Projects completion writes, report notification/workflow persistence, language preference writes that are not commit-gated, support-draft corruption fallback, and monitor diagnostics that still inspect LocalStorage. The dynamic script review found PDF-library loading rather than a hidden application storage loader. No app code, user data, LocalStorage, IndexedDB database or production branch was changed; only this plan document was updated.


## 18. Application startup, module ordering and async conversion audit — pass 9

### Observed startup sequence in the current v250 source

1. The Accounting script defines `loadDB()` and `persist()` as synchronous LocalStorage functions. `loadDB()` parses the Accounting envelope and merges it with `defaultDB()`; malformed or structurally invalid data sets the Accounting integrity lock and blocks writes.
2. Immediately after the Accounting function definitions, startup calls `loadDB()`, then runs `removeKnownIsolationTestRecord()`, `cleanupUncommittedInvoiceNumbers()`, `resetStaleSequenceOnlyWhenNoSavedRecords()`, `assignNumbersToExistingIncome()`, `removeOrphanedInvoiceIncome()`, and payment/invoice field normalization. Some of these paths mutate `db` and write it directly or call `persist()`; at least one orphan-cleanup persistence result is not checked.
3. The same Accounting startup section calls `show('accountancyHome')` and `syncLauncherBrand()` before the Projects module has initialized its in-memory `prDB`. `syncLauncherBrand()` therefore reads the Projects LocalStorage envelope directly.
4. The Projects script then declares `prDB`, defines `prLoad()`/`prPersist()`, calls `prLoad()` synchronously, and performs a legacy project-sync cleanup that may mutate Accounting entries and call `persist()` without checking the result. This means Accounting startup cleanup and Projects startup cleanup are separate commits, not one atomic cross-domain initialization.
5. `openProjectsApp()` calls `prLoad()` again on navigation, re-reading LocalStorage instead of using a single validated bootstrap snapshot. Projects completion writes `PR_KEY` directly. Project/accounting synchronization helpers also commit Accounting and Projects separately.
6. The Contracts IIFE is defined and executed later in the document. Its `ctRead()` and `ctWrite()` are synchronous LocalStorage wrappers; `ctRenderSaved()` reads when the Contracts section is rendered. Contract profile/logo rendering independently reads the Projects LocalStorage envelope.
7. The Reports module loads ARCH, NOTIFS, CFG and FLOW at script evaluation time, before `report188Init()`. It initializes its UI later through a `setTimeout` from DOMContentLoaded and whenever the report panel is shown. The email settings key is read lazily when the email page opens. Repeated `report188Init()` calls reset its internal navigation state and run due-date checks.
8. Language initialization runs later in its own script and reads/writes the language preference keys immediately. Monitoring functions are defined in a later script and read LocalStorage when called. The version manager is loaded near the end of the document.

### Startup and consistency risks

- There is no IndexedDB readiness barrier. The current scripts assume synchronous LocalStorage is immediately available and begin normalization, cleanup, UI navigation and report initialization during page evaluation.
- A future asynchronous repository cannot simply replace `getItem()`/`setItem()`: module-level report loads, synchronous `ctRead()`, synchronous `prLoad()`, event handlers and startup calls all require an explicit async bootstrap/API conversion.
- The UI currently becomes navigable before all domains have been loaded and validated. With IndexedDB, no edit, invoice, project, contract, report, backup, restore or reset action should be enabled until the bootstrap has completed and the core envelopes plus required auxiliary domains pass validation.
- Startup cleanup must not run against default/empty objects while IndexedDB reads are pending or failed. In particular, invoice sequence cleanup/reset and orphan removal must not run before Accounting is loaded and validated; legacy project-sync cleanup must not run before both Accounting and Projects envelopes are loaded and validated.
- The present order allows Projects startup cleanup to mutate Accounting after Accounting's own initialization and persistence. The target design should replace these separate startup mutations with explicit, reviewed migration/repair operations and transaction boundaries. No automatic cleanup should be carried over blindly into the first IndexedDB startup.
- `syncLauncherBrand()`, financial report/logo rendering, contractor selection, contract profile rendering and diagnostics currently read Projects data independently. They must consume the one canonical in-memory workspace established by bootstrap or await the repository; they must not race a second LocalStorage read.
- Reports are especially sensitive to eager module-level loads. Convert report initialization into an explicit `await initializeReports(repositorySnapshot)` step after the bootstrap barrier. Make initialization idempotent and do not reset user navigation or perform persistence side effects merely because the panel is reopened.

### Required async conversion map

| Current synchronous boundary | Required target behavior |
|---|---|
| `loadDB()` / `persist()` | `await repository.get('accounting','main')` and transaction-backed commit; commit/readback outcome controls UI success |
| `prLoad()` / `prPersist()` | Async load/commit of the complete `projects/workspace` envelope; no re-read on ordinary navigation |
| `ctRead()` / `ctWrite()` | Async Contracts repository operations; all save/delete/list callers await and handle failure |
| Report module `load()` at evaluation | No storage reads at evaluation; inject validated report state during async module initialization |
| `save()` and report callbacks | Await repository commit; archive/notification/workflow changes use atomic operations where logically coupled |
| `currentAppLang()` / `setAppLanguage()` | Async preference bootstrap/save; apply selection only after successful commit where persistence is promised |
| `monitorReadLog()` / `monitorWriteLog()` | Async best-effort diagnostics operations; diagnostic failures do not block business transactions |
| `submitHelpContact()` | Async support-draft insert; display local-only saved status only after commit |
| `backup()` / `restore()` | One consistent multi-domain snapshot and one atomic validated restore transaction |
| `factoryResetFinalConfirm()` | Explicitly scoped atomic reset plus recovery snapshot; no sequential multi-key deletes |
| `reserveRecordNumber()` and invoice workflows | Reserve counter and commit invoice/income changes in one Accounting transaction; never lower high-water mark |
| Project/accounting synchronization | One cross-domain transaction for the full logical operation; preserve manual entries and idempotency |

### Proposed bootstrap state machine

Use an explicit state machine: `booting` → `repository-ready` → `core-loaded` → `validated` → `auxiliary-loaded` → `ready`. Any failure transitions to `recovery-required` and leaves all mutating UI disabled. A separate migration state may run only after the source inventory, destination preflight and user-approved migration plan are available. No fallback to empty defaults and no LocalStorage fallback after cutover.

### Pass 9 conclusion

The current source confirms that the application is not structured for an asynchronous storage swap: Accounting initializes and performs cleanup before Projects loads; Projects then performs additional Accounting cleanup; Contracts and Reports load independently later; language and monitoring also initialize independently. The next design step should define the bootstrap coordinator and transaction boundaries before changing executable code. No app source, LocalStorage, IndexedDB database, backup, branch topology or production files were changed in this pass; only this migration-plan document was updated.


## 19. Bootstrap coordinator and atomic workflow contract — pass 10

### Repository capability check

The current isolated `storage-repository.js` exposes `get`, `put`, `remove`, `transact`, `mutate`, `reserveCounter`, `snapshot`, `restore`, `health` and `selfTest`. `transact` writes a non-empty list of records in one read-write transaction on the single `records` object store. `mutate` performs synchronous per-record read/modify/write callbacks in one transaction and aborts on callback failure. `reserveCounter` atomically advances one counter record using `max(current, minimum) + 1`.

Important limitation: `mutate` callbacks receive only the current value for their own record. The API does not currently expose a transaction-scoped multi-record view or a cross-record validation callback. Consequently, it cannot by itself atomically derive a new invoice number from both the sequence record and the Accounting envelope, validate uniqueness against current invoices/income, and commit the invoice plus linked income in one logical operation. A dedicated transaction-scoped `mutateMany`/`transactUpdate` API is required before invoice workflow integration. Do not simulate this with separate `get()` and `put()` calls or trust a stale in-memory floor.

### Bootstrap coordinator contract

Create one coordinator (design name: `THAStorageBootstrap`) that owns repository readiness, canonical loading, validation and app activation. It must be the only startup path that loads persisted application state. The coordinator should:

1. Await repository `ready()` and verify expected database/schema identity. Do not create or open the existing polluted `the_handyman_accountancy_test226` database; the v250 repository database remains the isolated target.
2. Load required canonical envelopes from `accounting/main`, `projects/workspace` and `contracts/main` in a consistent readonly transaction. The current repository has `get()` per record only; add a `readMany()` snapshot API using one readonly transaction so the three core envelopes are observed at one consistent database point.
3. Validate each envelope without merging `defaultDB()` into the stored source object, silently adding fields, or dropping unknown fields. Runtime adapters may expose safe derived defaults to UI code, but must keep the persisted canonical envelope unchanged until an intentional user mutation.
4. Load explicitly selected auxiliary records (reports, preferences, diagnostics and support) with per-domain validation and corruption status. Missing optional records may use documented defaults in memory; malformed existing records must be treated as recovery-required and must not be overwritten by defaults.
5. Construct one in-memory application state object and inject it into Accounting, Projects, Contracts, Reports, language, Monitoring and Support modules. These modules must not independently read LocalStorage or independently bootstrap themselves.
6. Run no legacy cleanup, sequence reset, orphan removal, project-sync normalization or automatic repair during the first read-only bootstrap. Any repair must be separately named, reviewed, tested, and committed atomically after all relevant envelopes have been validated.
7. Enable the application only after all required core and configured auxiliary records are loaded and validated. Any required repository failure transitions to `recovery-required`; all mutating UI stays disabled and the original legacy LocalStorage remains untouched.

Suggested coordinator phases: `booting` → `repository-ready` → `core-loaded` → `core-validated` → `auxiliary-loaded` → `ready`. Failure at any phase transitions to `recovery-required`. Migration is a separate gated operation, not an implicit side effect of startup.

### Atomic workflow matrix

| User operation | Canonical records touched | Required single-transaction behavior |
|---|---|---|
| Create/edit invoice | `accounting/main`, `accounting/sequence` | Validate chosen invoice number against the current Accounting envelope inside the transaction; update invoice/customer data and monotonic sequence together. If number is auto-assigned, reserve it from the same transaction's current sequence and uniqueness state. |
| Mark invoice paid | `accounting/main` | Update invoice status/date/method and create or update its linked income entry in the same Accounting envelope commit. Preserve duplicate-payment confirmation as a pre-commit user decision, then revalidate relevant state in transaction. |
| Mark invoice unpaid/delete invoice | `accounting/main` | Change invoice and remove only its correctly linked generated income in one commit; preserve unrelated/manual income. |
| Create/edit project workspace | `projects/workspace` | Commit the complete workspace envelope once; update in-memory state and UI only after commit. |
| Project completion toggle | `projects/workspace` | Persist status only. Preserve current explicit behavior: completion toggle itself does not create, remove or synchronize accounting entries. |
| Project financial sync | `projects/workspace`, `accounting/main` | Compute candidate generated rows from the candidate Projects envelope; replace only rows explicitly tagged for that project and corresponding generated third-party rows; commit both envelopes atomically. Manual rows remain unchanged. For sync-all, all projects and Accounting commit as one operation, not a loop of independent commits. |
| Save/delete contract | `contracts/main` | Validate IDs and payload, commit full Contracts envelope, then update UI. |
| Generate/save report | `reports/archive`, `reports/notifications` | If report generation creates an archive item and a notification, commit both together. Do not show success if either write fails. |
| Complete report period | `reports/workflow`, `reports/notifications` | Commit workflow status and its associated notification state together where both are changed by the action. |
| Full backup | Accounting, Projects, Contracts plus explicitly selected auxiliary records | Capture a consistent readonly snapshot in one transaction. The backup format must identify exactly which domains are included; v6 remains the approved core-data backup and is not retroactively reinterpreted as a full device image. |
| Full restore | All domains explicitly declared by restore mode | Validate and stage all incoming data before opening the transaction; atomically replace only declared domains. Preserve all unspecified domains by documented policy. No data-dependent merge or recalculation unless separately approved and tested. |
| Factory reset | Core envelopes, sequence, recovery snapshot and reset marker | In one transaction create immutable recovery snapshot and reset marker, then remove/reset only the explicitly confirmed reset scope. Auxiliary retention/deletion must be separately disclosed. Never clear LocalStorage during IndexedDB cutover. |
| Support draft | `support/drafts` | Insert a draft record; preserve `pending-local-only`; UI says saved locally only after commit. |
| Monitoring | `diagnostics/monitor-log` | Best-effort append/retention operation outside the business transaction; failure cannot reverse a successful invoice/project save. |

### Transaction API work required before app integration

1. Add `readMany([{domain,key}, ...])` using one readonly transaction and return validated clones plus a consistent snapshot marker.
2. Add `mutateMany([{domain,key,initialValue}, ...], callback)` where one callback receives all current values and returns the complete set of replacement values. The callback must be synchronous, deterministic, side-effect-free and run inside the active IndexedDB transaction; thrown errors abort all writes. It must support conditional validation (invoice-number uniqueness, linked-record invariants and project-sync ownership) against the transaction's current records.
3. Add explicit `deleteMany`/domain-replacement semantics for restore and reset, with allow-listed domain scope and transaction abort on any validation error. The existing `restore(snapshot)` already replaces declared domains atomically, but app restore needs a staged/validated application-level wrapper and a policy for auxiliary domains.
4. Add operation-specific tests: two competing invoice reservations, duplicate invoice-number rejection, invoice+income atomicity, project+Accounting sync atomicity, sync-all rollback, restore across core envelopes, factory-reset snapshot+marker+reset atomicity, and report archive+notification atomicity.
5. Keep repository callbacks free of network calls, timers, DOM updates and `await` gaps. Update UI state only after transaction completion. Verify readback after commit in a separate readonly transaction; the transaction completion event is the commit boundary.

### Migration and data-preservation guardrails

- Do not modify `index.html` or wire repository scripts into it during this design pass.
- Do not import v6 or any LocalStorage value in this pass. v6 remains a separate approved input for a later staged import test.
- Do not run repository `restore()` against the production app or an existing test database. The dedicated v250 repository and prior roundtrip test DBs remain separate; no cleanup or deletion is authorized.
- Keep LocalStorage read-only and untouched until the final cutover is separately approved. After cutover, do not implement a LocalStorage fallback.
- Preserve exact core envelopes and unknown fields; do not normalize, recalculate project prices, merge device-specific companies, or add review flags during the migration/import path.
- The current repository self-test pass validates repository primitives only. It does not validate these application workflows; the new operation-specific tests are still required.

### Pass 10 conclusion

The bootstrap and transaction contract is now defined. A critical repository API gap has been made explicit: the existing per-record `mutate` and `reserveCounter` cannot atomically validate and update invoice numbering against the Accounting envelope without a new multi-record transaction callback. The correct next step is to implement and independently test the repository transaction extensions in the existing isolated test branch, without wiring them into the app. No application source, browser data, LocalStorage, user backup, existing database contents or production branch was changed in this pass; only this design document was updated.


## 20. Repository transaction extensions — pass 11

### Implemented in the isolated repository module

The existing `storage-repository.js` has been extended without wiring it into `index.html`:

- `readMany(descriptors)` validates a non-empty list of unique `{domain,key}` descriptors, issues all reads in one readonly transaction on `records`, waits for transaction completion, and returns cloned `{domain,key,value}` records in descriptor order. Missing records are represented as `value: null`.
- `mutateMany(descriptors, updater)` validates unique descriptors and opens one read-write transaction. It reads all requested records in that transaction, supplies cloned current values to one synchronous updater in descriptor order, requires exactly one replacement value per descriptor, validates serializability before scheduling writes, then commits all writes together. An updater exception, Promise return, invalid return shape or failed request aborts the transaction. After commit it performs a separate readonly read-back and compares exact serialized values.
- The updater receives an ordered array of `{domain,key,value}`. Missing values use each descriptor's `initialValue`, or `null` when omitted. The updater must be deterministic and side-effect-free; no DOM, network, timer, logging dependency or `await` is permitted inside it.
- The repository API exports both new methods. Build identifiers were advanced to `repo-selftest-20261107-03`; the manual lab was advanced to `lab-selftest-20261107-03`, with its expected build and cache-buster aligned.

### Self-test coverage changes

The existing 12-check report contract was retained so the lab's report shape remains stable. Existing checks were strengthened:

- `atomicMultiDomainMutation` now exercises `mutateMany` across Accounting, Projects and Contracts-shaped synthetic records and verifies a consistent `readMany` result.
- `abortRollback` now injects an exception in the multi-record updater and verifies that neither pre-existing record changed; the existing deliberate native IndexedDB abort check remains.
- `concurrentCounterReservation` now runs eight competing multi-record invoice reservations. Each transaction reads the sequence and invoice-ledger records together, computes a number above the current sequence and all existing invoice/income numbers, then writes the incremented sequence and invoice ledger atomically. The test checks unique monotonic values 1–8 and the final ledger contents.
- The unique synthetic namespace preflight now includes `invoice-ledger`; cleanup verification includes this record.

### Verification status and limits

- GitHub read-back confirms the repository source and lab page contain the new APIs and matching build identifiers.
- The repository JavaScript passed a syntax compilation check.
- Browser execution of the updated lab has **not yet been confirmed** in this pass. The self-test is not considered passed until the lab returns `ok: true`, all 12 checks true, no missing/unexpected checks, `buildMatches: true`, `reportComplete: true`, and `localStorageAccessed: false`.
- These tests validate the generic transaction primitive using synthetic records. They do not yet prove the real invoice UI, payment flow, project sync, restore, factory reset or reports.

### Safety boundary

Only `storage-repository.js`, `storage-repository-lab.html` and this design document were changed on the existing `release239` branch. `index.html` and all application modules remain unchanged. No LocalStorage was read or written by these code changes; no backup was imported; no IndexedDB records were created, migrated, restored or deleted by the repository source edit itself. The production `main` branch and v247 baseline remain untouched.

### Pass 11 conclusion

The transaction-scoped multi-record API is implemented and statically checked. It is ready for isolated browser self-test, but is not yet approved for app integration. Browser test evidence is the remaining gate for this pass.


## 21. Concurrent read-back correction — pass 11 retest build 04

### Failure evidence from build 03

The user's browser result confirmed that build identifiers matched build 03, and the following checks passed: `ready`, `roundTrip`, `atomicBatch`, `atomicMultiDomainMutation`, and `abortRollback`. The concurrent reservation check failed with:

`Multi-record read-back verification failed for <synthetic-domain>/invoice-counter`

The remaining snapshot/restore and cleanup checks were not reached. The report correctly showed `cleanupAttempted: false`; the failed run's synthetic namespace must therefore be treated as potentially present in the dedicated test database.

### Root cause

The build 03 implementation committed a `mutateMany` read-write transaction, then opened a separate readonly transaction and compared the current stored values with that operation's own committed values. With concurrent callers, a later serialized writer can commit between those two transactions. The later writer legitimately advances the shared counter, so the earlier caller's post-commit comparison can observe the newer value and incorrectly report its own successful transaction as failed.

This was a verification race, not evidence that IndexedDB allowed two read-write transactions to mutate the same records simultaneously or that invoice reservations were duplicated.

### Correction in build 04

- `mutateMany` now queues read-back requests for all records inside the same active read-write transaction, after its writes have been queued.
- It compares those read-back rows against the values written by that transaction before awaiting transaction completion.
- This prevents another queued writer from committing between the write and its verification, while preserving the atomic multi-record transaction boundary.
- The repository build is now `repo-selftest-20261107-04`; the lab build is `lab-selftest-20261107-04`, with matching expected build and script cache-buster.
- The app remains unwired. This correction does not read or modify LocalStorage, import backup v6, or touch production.

### Retest status

Build 04 is a code correction only. It has not passed browser testing yet. Do not treat Pass 11 as passed until a fresh build-04 browser report confirms all 12 checks, complete report, matching builds, and no LocalStorage access. The prior failed synthetic namespace `test_mw6e6s2k_rtexou4y` is not automatically cleaned by this code correction; do not perform a broad database clear.

## 22. mutateMany request-lifecycle correction — build 05

### Build 04 browser evidence

The user ran the matching build-04 lab and received:

`Multi-record transaction completed without executing its updater.`

All checks through `atomicBatch` passed; `atomicMultiDomainMutation` and all later checks did not. The browser output confirmed matching lab/repository build 04.

### Root cause

The build-04 correction queued the verification reads but checked `committedValues` immediately, before IndexedDB had dispatched the queued `get()` request success events. The transaction could therefore finish without the updater ever being reached. This was a request-lifecycle sequencing defect in the test repository implementation.

### Build 05 correction

- Reworked `mutateMany` to coordinate all reads, updater execution, writes and verification through IndexedDB request event callbacks within one active read-write transaction.
- The updater runs only after every requested record read has succeeded.
- All replacement values are validated before writes are queued.
- Verification `get()` requests are queued after the writes in the same transaction; their success handlers compare each stored row with the value produced by this transaction.
- The public Promise resolves only after the transaction completes and all in-transaction verification has succeeded. Any request, updater, serialization or verification error aborts the transaction.
- Repository and lab identifiers are now `repo-selftest-20261107-05` and `lab-selftest-20261107-05`.

### Status and safety

Build 05 is a code correction only and has not yet passed browser testing. Do not mark Pass 11 complete until the full 12-check browser report passes. The build-03 and build-04 failed test namespaces may remain in the dedicated test database because both reports showed `cleanupAttempted: false`; no broad cleanup or database deletion is authorized. Application wiring, LocalStorage, user backup v6 and production remain untouched.
