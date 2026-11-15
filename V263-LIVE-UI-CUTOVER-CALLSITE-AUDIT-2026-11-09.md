# THA v263 — live UI cutover call-site audit
Date: 2026-11-09
Status: Source inspection only. No live UI cutover performed.

## Entry point
The current test-repository `index.html` is still the v262 application (663,037 characters, 3,039 lines). Its script tags load `storage-foundation.js` and `version-manager.js`; it does not load the v263 engine, strict domain boundary, adapter, or domain controllers.

## Blocking synchronous-to-asynchronous conversions
The legacy application keeps mutable global state and synchronous storage functions:
- Accounting: `loadDB()` at line 1112; `persist()` at line 1117; startup call at line 1753.
- Projects: `prLoad()` at line 1760; `prPersist()` at line 1761; Projects entry calls `prLoad()` synchronously at line 1764.
- Contracts: `ctRead()` at line 2147; `ctWrite()` at line 2148; save/load/delete paths at lines 2171–2174.
- Invoice sequence and cleanup: legacy LocalStorage routines around lines 1425–1433.
- The UI reads and mutates the in-memory globals synchronously across many event handlers. The v263 controllers return Promises and require awaited calls. Merely adding script tags would leave the app writing to LocalStorage while the new controllers sit unused.

## Additional incompatible behavior
1. Startup performs automatic record cleanup/number assignment and may call `persist()` at line 1753. This must not run against an empty v263 database before a verified migration/import.
2. Existing backup at lines 1384–1401 is a combined LocalStorage + IndexedDB package and restores all domains. It conflicts with the required independent Projects and Accounting backups.
3. `syncLauncherBrand()` reads logo from the legacy Projects LocalStorage key at line 1378.
4. Project profile UI reads and writes `prDB.profile` around lines 2129–2131. Business Profile is required to be a separate neutral domain.
5. Company job UI still contains legacy accounting linkage checks such as `accountingEntryId` (around line 1794). Historical values may be retained as inert audit data, but the UI/controller must not follow or create them.
6. Project delete UI text still assumes linked Accounting entries (around line 1826). It must be rewritten to describe Projects-local deletion only.
7. The existing Factory Reset path around lines 1406–1412 and global clear code must be replaced by domain-local reset behavior; no all-domain clear is permitted.
8. The existing report/diagnostics and language functions still access LocalStorage directly, including language setup near the end of the file.

## Architecture correction made during this audit
`app-storage-v263.js` restore routing was corrected so invoice-sequence restore uses the `invoiceSequence` scope, and malformed package shape is rejected before accessing its domain list. Commit: `2810960499b74b7a12ea07732e4de4c851961a3e`.

## Cutover order — required, not yet executed
1. Freeze the v262 UI source as a reference; never replace production or test root `index.html` during the refactor.
2. Build a separate v263 candidate entry point and load only the v263 engine, boundary, adapter, and controllers.
3. Convert startup to async and block all writes until the user chooses a verified data-import route or explicitly starts with a clean database.
4. Convert Accounting read/write event paths to awaited Accounting-controller operations. Keep invoice sequence isolated and never route it through Projects.
5. Convert Projects paths to awaited Projects-controller operations. Keep project ledgers, media, reports and Extra Job data entirely in Projects. Remove all Accounting-link behavior.
6. Extract Business Profile into its neutral domain with a conflict-safe import that preserves the logo and all profile fields; consumers are read-only.
7. Convert Contracts to its own controller and independent backup.
8. Replace combined backup/restore/reset with the domain-only recovery module.
9. Convert support, language, report archives, diagnostics, and every remaining storage callsite.
10. Run one consolidated source scan for executable LocalStorage/SessionStorage access and a focused browser smoke test on the candidate only. Do not publish until all paths are converted.

## Data protection
- No legacy data was read or migrated by this audit.
- No IndexedDB or LocalStorage records were changed.
- Main app `index.html` was not edited.
- The v263 candidate is not yet a usable release.
