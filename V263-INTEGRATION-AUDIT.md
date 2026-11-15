# v263 Application Integration Audit

Date: 2026-11-09
Branch: main
Scope: read-only inspection of the current application shell and existing v263 modules.
Production files changed: none.

## Baseline integrity
- `index.html` SHA-1: `27aa37e181f57e31fc5d8d3568d779ad99f5746e` (663,037 characters; 3,039 lines).
- `version.json` remains v262 / `THA-262-RESTORE-ROLLBACK-REBUILD-20261108`.
- `service-worker.js` unchanged.
- No v263 adapter, engine, or controller is loaded by `index.html`.

## Findings from index.html
- 127 textual references to `localStorage`.
- 45 source lines contain direct LocalStorage access.
- No `sessionStorage` references were found.
- 78 references to the existing IndexedDB foundation are present, but these are not the v263 engine/adapter.
- The v263 adapter/controller globals are not referenced by the application shell.
- The existing application is still LocalStorage-authoritative; the accounting dual-write path is only a shadow copy to the older `HandymanStorageFoundation`.

## Existing application storage areas and migration targets

| Existing area / functions | Current responsibility | v263 target | Required integration work |
|---|---|---|---|
| Accounting: `loadDB`, `persist`, entry/customer/invoice CRUD | Entries, customers, invoices, custom categories, settings | `accounting` | Replace synchronous load/save with awaited controller calls; update every caller and rendering lifecycle; preserve validation and rollback semantics. |
| Invoice numbering: `highestSharedRecordNumber`, `reserveRecordNumber`, invoice cleanup/assignment | Shared invoice/income sequence and startup cleanup | `sequences` | Use atomic `reserveInvoiceNumber`; remove LocalStorage sequence keys and startup cleanup side effects. |
| Projects: `prLoad`, `prPersist`, project/subproject/ledger/directory functions | Projects, subprojects, workers, partners, contractors, companies, profile/logo | `projects` | Convert all reads/writes to async; verify Extra Job/subproject amount rules, project P&L, contractor/partner and completion workflows. |
| Contracts: `ctRead`, `ctWrite`, contract CRUD and `ctProfile` | Contract records and project profile lookup | `contracts` + `projects` | Convert contract flows to async and read profile through Projects controller; preserve attachments and PDF preview. |
| Report archive and language helpers | Report archive, notifications/settings/workflow, language | `reports`, `reportNotifications`, `reportSettings`, `reportWorkflow`, `preferences`, `preference_meta` | Connect report generation/archive and all language bootstrapping/UI actions to async support controller. |
| Monitor: `monitorReadLog`, `monitorWriteLog`, diagnostics | Activity archive, diagnostics and export | `diagnostics` | Replace Storage prototype hooks and LocalStorage wrappers with explicit async diagnostic writes; keep diagnostics failure-safe. |
| Logo / launcher / contract branding | Business profile logo and identity | `projects` (profile) | Load profile before rendering launcher, report and contract branding; preserve Blob/File media. |
| Backup / restore / factory reset | Current mixed LocalStorage + legacy IndexedDB package and reset flow | `HandymanRecoveryV263` | Replace old package format and UI handlers; ensure reset lock/recovery rules are honored end-to-end. |
| Software update / offline | Version manager and service-worker cache lifecycle | Browser Cache Storage + version metadata (not business-data domains) | Audit separately; do not put service-worker caches or app shell version state into business-data records. |

## Current v263 modules available on main
- Engine: `storage-idb-v263.js`, SHA-1 `57bf2547be63a44f4da59d70adbfcae9bb47a125`.
- Adapter: `app-storage-v263-v4.js`, SHA-1 `456f7137d2c399f355afa079525daedccf26c9b9`.
- Accounting controller: `v263-accounting-controller-diagnostic-v2.js`, SHA-1 `c92cfb78ffe81c24fec96d0efe4bc81495683698`.
- Projects controller: `v263-projects-controller.js`, SHA-1 `aa7024ebb92ff83386de1683c47d15a6089c6b45`.
- Contracts controller: `v263-contracts-controller.js`, SHA-1 `39dfecd8406fa8f44df44c0399e13f7964f81e86`.
- Support controller: `v263-support-controller-v2.js`, SHA-1 `6282e47c68e0bcd730d254b81ca7c245c89a477f`.
- Recovery module: `v263-recovery.js`, SHA-1 `cac52abe54a6f6d53a3ec9853b43f10fa1ae7756`.

## Integration blockers and design requirements

1. The application shell has synchronous assumptions throughout. Replacing storage functions alone is insufficient; all callers, startup initialization, event handlers, rendering and navigation that depend on loaded data must become async-aware.
2. Several business actions span multiple domains. Examples include invoice payment creating accounting income, project/company-job payment posting to Add Income, approved project/accounting transfers, and contract/project profile linkage. These need atomic multi-domain transactions or an explicit staged/approval workflow; they must not be implemented as independent writes that can partially succeed.
3. Existing adapter defaults are not proof that every current field/workflow is represented. Validate the full live object shapes and preserve unknown properties and nested binary media.
4. The Projects controller currently exposes generic project/subproject/ledger operations but not all business invariants as named workflows. These invariants must be enforced by the controller/service layer, not only by UI handlers.
5. Recovery's isolated 11/11 lab verifies its own synthetic dataset. It does not yet prove the actual app shell's backup, restore, reset or reload behavior.
6. The old LocalStorage-based backup, restore, reset, monitor hooks, language initialization and branding paths must be removed or rewritten before declaring IndexedDB-only.
7. Startup must fail closed if IndexedDB is unavailable. It must not silently initialize empty business state and permit writes.

## Recommended integration sequence
1. Introduce a v263 application bootstrap that awaits engine, adapter and all domain controllers before enabling the UI. Keep the current app entry point untouched until the isolated integrated shell passes.
2. Refactor domain services and all UI callers to async operations. Preserve the existing object schema and financial invariants.
3. Implement cross-domain workflows using atomic transactions, with explicit approval for project-to-accounting transfers.
4. Integrate logo, receipt, project, contract and report media as structured-clone values; test export/import round-trips.
5. Replace the legacy backup/restore/reset UI with the v263 recovery module and test reload/recovery on iPhone Safari.
6. Audit update/offline/service-worker behavior independently; do not mix cache state with business data.
7. Only after the integrated shell passes the complete workflow suite should a separate, explicitly authorized cutover update `index.html`, `version.json` and release assets.

## Safety status
This is an inventory and integration plan only. No production entry point, release metadata, service worker, user data, or existing branch was changed. No new branch was created.
