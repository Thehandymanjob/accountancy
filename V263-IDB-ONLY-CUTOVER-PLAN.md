# THA v263 — IndexedDB-only cutover plan

Status: foundation self-test PASS (Build 3); application cutover NOT performed.
Candidate source: `main`, based on the v262 source tree.
New module: `storage-idb-v263.js`
New database: `the_handyman_accountancy_v263_idb`

## User-approved target behavior

- Start with a new, empty IndexedDB database.
- Do not import or migrate historical LocalStorage records.
- Do not read LocalStorage as a fallback.
- Do not write to, clear, or delete LocalStorage as part of application operation.
- All application persistence, preferences, media, reports, diagnostics, backups, restore and reset must use IndexedDB.
- Keep the existing v262 source intact as the rollback reference until v263 has passed full tests.

## Current source facts

The v262 `index.html` is approximately 663 KB / 3,039 lines and contains 95 direct LocalStorage property/method expressions across 53 source lines. These are not all the same behavior: some are business-data persistence, others are diagnostics, backup/restore, test tools, language preferences and monitoring hooks.

The existing `storage-repository.js` is an isolated v250 repository. It is not loaded by the application entry point, stores JSON-serialized values, and does not provide lossless Blob/File storage as first-class values. The app entry point currently loads `storage-foundation.js`, which targets the separate test226 database and includes legacy LocalStorage inspection/backup/restore functionality. Neither module is a completed app-wide cutover.

The v262 version manifest explicitly describes LocalStorage as the source for existing app state and documents backup/restore coverage of app-namespaced LocalStorage. Therefore v262 must not be represented as IndexedDB-only.

## New foundation

`storage-idb-v263.js` creates a separate v263 IndexedDB database and exposes asynchronous operations:
- `ready`, `get`, `readMany`
- `put`, `remove`, `transact`, `mutateMany`, `reserveCounter`
- `snapshot`, `restore`, `health`, `selfTest`

Values use IndexedDB structured cloning, including Blob/File objects. The module has no LocalStorage read/write fallback and is not yet loaded by `index.html`. Adding this module alone does NOT change application persistence.

## Required refactor map

1. **Application bootstrap**
   - Load the v263 repository before application modules.
   - Await `ready()` and validated initial reads before enabling editing controls.
   - Fail closed if IndexedDB is unavailable; never fall back to LocalStorage.

2. **Accounting**
   - Convert startup load, save-entry, customer, invoice, invoice payment status, settings, categories and integrity checks to awaited repository calls.
   - Remove startup cleanup/normalization writes and test-record cleanup from ordinary boot.
   - Reserve invoice numbers atomically with the invoice/accounting writes; never reuse a number.

3. **Projects and media**
   - Convert project load/save, completion toggle, workers, partners, contractors, companies, company jobs, receipts, expenses, profile and subprojects.
   - Store image/logo/receipt binary data as Blob/File values or references to binary records in IndexedDB.
   - Do not use data URLs in LocalStorage or an alternate synchronous cache.

4. **Contracts**
   - Convert contract reads/writes and preserve stable IDs and validation.

5. **Reports and preferences**
   - Convert report archive, notifications, report settings, workflow, email settings, contact drafts and language preferences.
   - Keep all timestamps and ordering in repository records.

6. **Diagnostics**
   - Replace LocalStorage monitor log and Storage.prototype hooks with explicit repository instrumentation.
   - Remove LocalStorage self-checks and LocalStorage comparison UI from the live app.
   - Diagnostics must never write business data or depend on a browser Storage API.

7. **Backup, restore and factory reset**
   - Export every application domain from IndexedDB, including Blob/File data.
   - Validate package schema, counts and content before restore.
   - Restore transactionally with a rollback strategy.
   - Factory reset must create and verify an IndexedDB backup before deleting the v263 app domains.
   - Do not include legacy LocalStorage records in the new backup format.

8. **Remove legacy integration**
   - Remove `storage-foundation.js` from the live app script chain once all callers have been replaced.
   - Remove or rewrite every remaining LocalStorage reference in the live app and any imported runtime modules.
   - Audit dynamic property access, aliases, Storage prototype wrappers, inline scripts and generated HTML.
   - Static search must show zero executable LocalStorage/SessionStorage references in the shipped application. Explanatory documentation may mention LocalStorage.

## Acceptance tests before release

- Static scan of every shipped executable file: zero LocalStorage reads, writes, deletes, clears, Storage.prototype hooks, or fallback adapters.
- Runtime instrumentation in Safari: no access to `window.localStorage` or `Storage` by application code.
- IndexedDB self-test passes for JSON, Blob/File, atomic writes, concurrent invoice reservations, rollback, backup/restore and reset.
- Fresh install starts with empty application domains and no legacy data import.
- Reload and close/reopen preserve newly entered records.
- Full regression: accounting, projects/subprojects, P&L, partners, contractor payments, contracts, invoices, PDF/print, reports, language, backup/restore, offline launch and update flow.
- Confirm IndexedDB unavailable/private-browsing failure is clearly reported without a LocalStorage fallback.
- Verify v262 rollback remains possible until v263 release is explicitly approved.

## Current non-actions

- No existing LocalStorage key was read or modified by the new module.
- No existing IndexedDB database was opened or changed by the new module.
- No application cutover or data migration was performed.
- `index.html`, `version.json`, `service-worker.js` and `version-manager.js` were not changed.
- v262 remains the active reference; v263 is not ready for installation.
