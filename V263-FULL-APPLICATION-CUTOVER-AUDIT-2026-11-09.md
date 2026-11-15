# THA v263 — Full Application Storage Cutover Audit

Date: 2026-11-09
Repository: Thehandymanjob/accountancy-test
Branch: main
Scope: read-only source inspection of the current application entry point and v263 isolated modules.
Production files changed: none. Application entry point changed: none.

## Executive result

**CUTOVER NOT APPROVED.** The application shell is still v262 and remains LocalStorage-authoritative. The v263 engine, adapter, project controller, contracts controller and support controller are not loaded by `index.html`. Passing isolated storage labs prove component-level behavior only; they do not prove the real application has been migrated.

## Verified entry-point facts

- `index.html`: SHA-1 `27aa37e181f57e31fc5d8d3568d779ad99f5746e`; 663,037 characters; 3,039 lines.
- Current script src list: `storage-foundation.js`, `version-manager.js`.
- Inline script blocks: 11.
- Direct storage scan: 55 lines with direct LocalStorage / Storage prototype / foundation access; 115 matched direct expressions using the scanner's explicit expression set.
- No v263 engine/adapter/controller script is loaded by the app entry point.
- The previous inventory counted 45 direct-access source lines using a narrower expression pattern. This audit uses a broader scanner that also counts Storage foundation references; do not compare the counts as if the scanner definitions were identical.
- App shell remains v262; no production integration was performed.

## Blocking areas confirmed in the entry point

| Area | Existing behavior | Required v263 work |
|---|---|---|
| Accounting bootstrap/save | `loadDB()` reads LocalStorage; `persist()` writes LocalStorage and only queues a shadow write to the older foundation | Async bootstrap barrier; IndexedDB authoritative reads/writes; convert every caller to await commit |
| Invoice numbering | Legacy sequence key and startup cleanup/repair logic | Atomic counter reservation; remove legacy sequence mutation paths |
| Projects | `prLoad()` / `prPersist()` read and write whole LocalStorage snapshots; completion has a direct LocalStorage write | Convert every project/subproject/directory/ledger/completion operation to async controller methods; preserve existing project object fields and Extra Job accounting rules |
| Contracts | `ctRead()` / `ctWrite()` use LocalStorage; contract branding reads project profile directly from LocalStorage | Async contracts controller; profile reads from projects domain; test PDF preview/generation and attachments |
| Branding/media | Launcher and report branding read the projects LocalStorage snapshot; profile logo expected as string/data URL in some paths | Async profile load before rendering; Blob/File-aware image and print handling |
| Backup/restore | Existing portable package includes LocalStorage and old IndexedDB; restore replaces legacy storage surfaces | New IndexedDB-only export/import package, schema validation, full binary round-trip, rollback on failed restore |
| Factory reset | Creates recovery snapshot from legacy LocalStorage keys and then resets old storage | New reset protocol based on v263 snapshot and reset lock; no LocalStorage reads or deletion |
| Diagnostics | Monitor log uses LocalStorage; Storage.prototype hooks instrument writes | Explicit bounded async diagnostics writes; remove Storage.prototype instrumentation |
| Language/preferences | Language and preference-version keys are read/written in LocalStorage | Async preferences bootstrap and atomic pair update |
| Reports/notifications | Existing archive/workflow helpers still use legacy key-value storage | Connect archive, notifications, settings and workflow to v263 support controller |
| Diagnostics/self-tests | Current monitor checks explicitly test LocalStorage and legacy IndexedDB foundation | Replace with read-only v263 health/diagnostic checks |

## Source locations to convert

The current `index.html` storage references are concentrated at these lines (line numbers are for the inspected SHA above):

- Accounting: 1112, 1117–1120, 1165, 1444, 1753–1756.
- Report language and branding: 1191, 1226, 1378.
- Backup / restore / factory reset: 1384, 1401, 1411, 1516.
- Invoice sequence and startup cleanup: 1425, 1427–1430.
- Customer persistence and other accounting paths: 1417, 1419.
- Projects and completion: 1760–1761, 1824, 2126, 2130.
- Contracts and profile: 2147–2148, 2175.
- Monitor and diagnostic hooks: 2295–2299, 2317, 2332–2345, 2369–2389, 2399, 2413–2415.
- Language bootstrap and setter: 2942–2948, 2973.

## Required implementation gates

1. **Freeze a rollback point.** Preserve the current v262 entry point and backup; do not overwrite it during experimental work.
2. **Build a v263 application shell in an isolated test path/file.** Load only the dedicated v263 engine and controllers. Do not make it the root entry point yet.
3. **Async startup barrier.** The UI must remain in a loading/locked state until IndexedDB initialization and required domain validation complete. No fallback to LocalStorage.
4. **Convert accounting and invoice sequence.** Convert all CRUD, invoice creation/edit/delete/payment, income/expense workflows, and every caller of `persist()`. Ensure the invoice number is reserved atomically and failures do not create gaps/duplicates beyond the documented policy.
5. **Convert projects and media.** Convert all project/subproject CRUD, Extra Job, income/expense ledgers, project P&L, partners, contractors, company jobs, completion/reopen, profile, logo, project images and receipt images. Preserve unknown fields and stable IDs.
6. **Convert contracts and PDF.** Convert all contract reads/writes, customer/project links, attachments, preview and PDF generation.
7. **Convert reports, preferences and diagnostics.** Remove direct storage helpers and Storage.prototype wrappers; test language switching and all report workflows.
8. **Replace backup/restore/reset end-to-end.** Use IndexedDB snapshot/export including Blob/File data; validate before commit; verify rollback and recovery lock behavior. Test reset followed by import of the backup without relying on any pre-reset data.
9. **Audit service worker and offline/update behavior separately.** Keep CacheStorage and app-shell versioning separate from business data.
10. **Static release scan.** All shipped app runtime files must have zero executable references to LocalStorage, SessionStorage, legacy Storage.prototype hooks, or old foundation calls. Comments/test fixtures may be excluded only with documented rationale.
11. **Safari regression suite.** Test every actual user workflow in the isolated shell, including reload, multiple tabs/concurrent writes, offline/reconnect, PDF, backup, reset and restore.
12. **Release approval.** Only after all gates pass and the user explicitly approves may the production entry point be changed.

## Safety boundary

This audit is read-only. No app entry point, production file, production database, LocalStorage record, backup, or service worker was changed. Do not import real user data into any current lab database. All tests so far use synthetic data and dedicated IndexedDB database names.

## Current decision

**Continue with isolated integration only. Do not switch the production app to v263 yet.**