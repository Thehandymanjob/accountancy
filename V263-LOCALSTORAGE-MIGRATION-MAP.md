# v263 LocalStorage Migration Map

Date: 2026-11-09
Branch: main
Source inspected: `index.html` at blob SHA `27aa37e181f57e31fc5d8d3568d779ad99f5746e`
Scope: read-only source inventory and mapping to the existing v263 modules. This document does not change the application or migrate data.

## Executive result

- The shipped application shell is still v262 and LocalStorage-authoritative.
- The v263 engine, adapter and controllers are not loaded by `index.html`.
- The source contains 17 distinct literal `tha_test226_*` storage keys.
- Static scan found 70 source lines containing the token `localStorage`; across those lines: 55 `getItem`, 26 `setItem`, and 11 `removeItem` call sites. Counts are lexical source matches, not a claim of 92 independent business workflows; some lines contain multiple calls and diagnostic strings/comments.
- A previous audit counted 127 textual references. That is a broader text-token count, not a count of distinct keys or call sites.
- No `sessionStorage` references were found in the inspected source.
- No v263 cutover has been performed. Production entry point, release metadata and service worker remain unchanged.

## Key-by-key migration map

| Current LocalStorage key / source area | Data or purpose | v263 destination | Integration status |
|---|---|---|---|
| `tha_test226_accounting_v1` (`KEY`; `loadDB` / `persist`) | Accounting entries, customers, invoices, categories and settings | `accounting` via `HandymanAccountingV263` | Controller exists; app load/save and all synchronous callers still need refactoring |
| `tha_test226_invoice_sequence_v1` | Shared invoice/income number high-water mark | `sequences` via atomic `reserveInvoiceNumber` | Adapter API exists; invoice creation/edit/delete/startup cleanup not yet wired |
| `tha_test226_invoice_sequence_cleanup_v1` | Startup cleanup one-time flag | `sequences` metadata or removal of obsolete cleanup logic | Not mapped to an explicit app workflow; decide whether it is obsolete |
| `tha_test226_empty_invoice_sequence_reset_v229` | Startup one-time sequence reset flag | `sequences` metadata or remove obsolete migration code | Not mapped to an explicit app workflow; preserve numbering invariant, not this legacy flag |
| `tha_test226_isolation_test_record_cleanup_v1` | One-time removal of a historical isolation-test record | No business-data destination; remove only after confirming the cleanup is no longer required | Legacy startup side effect; must be deliberately retired, not copied blindly |
| `tha_test226_projects_v1` (`PR_KEY`; `prLoad` / `prPersist`) | Projects, subprojects, workers, partners, contractors, companies, company jobs, profile/logo and project workflow state | `projects` via `HandymanProjectsV263` | Controller exists; async UI integration and business invariants remain |
| `tha_test226_contracts_v1` (`CT_KEY`; `ctRead` / `ctWrite`) | Contracts and their attachments/metadata | `contracts` via `HandymanContractsV263` | Controller exists; app CRUD, project profile lookup and PDF preview remain |
| `tha_test226_monitor_log_v1` (`MONITOR_LOG_KEY`) | Local activity and error archive | `diagnostics` via `HandymanSupportV263.appendDiagnostic` | Support API exists; replace synchronous hooks and monitor UI callers |
| `tha_test226_app_language_v1` (`APP_LANG_KEY`) | Selected interface language | `preferences` via `HandymanSupportV263.setLanguage` | Support API exists; bootstrap and language switch must await it |
| `tha_test226_app_language_pref_version_v1` | Language preference migration/version marker | `preference_meta` | Support API supports writing it; migration semantics and old marker retirement remain |
| `tha_test226_report_archive_v1` | Archived generated reports | `reports` | Support workspace API exists; report generation/archive UI not wired |
| `tha_test226_report_notifications_v1` | Report notifications | `reportNotifications` | Support workspace API exists; UI not wired |
| `tha_test226_report_settings_v1` | Report configuration | `reportSettings` | Support workspace API exists; UI not wired |
| `tha_test226_report_workflow_v1` | Report workflow state | `reportWorkflow` | Support workspace API exists; UI not wired |
| `tha_test226_help_contact_drafts_v1` | Locally saved help/contact drafts | No existing dedicated v263 domain | Must decide: add a support domain (recommended) or explicitly classify as disposable/non-persistent; do not silently drop it |
| `tha_test226_factory_reset_recovery_v1` | Pre-reset recovery snapshot of legacy LocalStorage values | Recovery package/metadata managed by `HandymanRecoveryV263` | Recovery module exists; reset UI and recovery lifecycle not integrated |

## Non-key storage paths that must also be addressed

1. **Portable backup/restore:** Current backup package explicitly captures LocalStorage records and legacy IndexedDB stores. Replace the UI flow with `HandymanRecoveryV263`; test actual app export, verification, restore and reset, not only synthetic lab records.
2. **Logo and media:** Project profile logo and project/subproject photos, contract attachments, receipt images and report media must remain binary-safe values (Blob/File or an explicitly versioned binary envelope). Do not convert large media to lossy strings.
3. **Project and accounting workflows:** Project payments, invoice payments, approved project-to-accounting transfers and contractor/partner costs cross domain boundaries. Enforce atomicity and existing approval rules in service/controller logic, not only UI event handlers.
4. **Startup cleanup:** Remove legacy startup mutations (test-record cleanup, invoice sequence cleanup/reset, orphan-income cleanup and field normalization) only after equivalent v263 migration/validation behavior is specified and tested.
5. **Diagnostics:** Existing monitor code patches `Storage.prototype` and records LocalStorage writes. Replace with explicit async diagnostic events; do not keep a LocalStorage dependency for diagnostics.
6. **Branding:** Launcher, report and contract branding currently read project profile synchronously. Bootstrap must load the project profile before those surfaces render.
7. **Update/offline state:** Service-worker and Cache Storage are not business data. Audit them separately; do not put app shell caches into business-data domains.

## Existing v263 APIs verified in source

- Adapter `HandymanAppStorageV263`: initialize/read/readAll/write/writeMany/mutate/reserveInvoiceNumber/backup/restore/health.
- Accounting controller `HandymanAccountingV263`: initialize/load/save/update and entry/customer CRUD plus atomic invoice-number reservation.
- Projects controller `HandymanProjectsV263`: initialize/load/save/update, project/subproject CRUD, directory and ledger operations.
- Contracts controller `HandymanContractsV263`: initialize/load/save/update, contract CRUD and get.
- Support controller `HandymanSupportV263`: initialize/load/save/update, appendDiagnostic, setLanguage and report workspace load/save.
- Recovery module `HandymanRecoveryV263`: backup creation, file inspection, restore and reset-from-backup.

These APIs establish available building blocks only. Their presence does not prove the production app is integrated or that all current data shapes and workflows are covered.

## Required work before cutover

1. Build an async v263 application bootstrap and keep the existing production entry point untouched while integration is developed.
2. Resolve the help/contact draft domain explicitly.
3. Map every app function that reads/writes the 6 core domains (accounting, projects, contracts, sequences, preferences, reports/diagnostics) to controller calls; convert callers, startup, navigation and render lifecycles to await data.
4. Add explicit controller/service workflows for invoice-payment linkage, project/company-job payments, approved project-to-accounting transfers, partner shares, contractor payments, project completion/reopen and the Extra Job subproject accounting rule.
5. Integrate all media and validate binary integrity through app backup/restore.
6. Replace backup/restore/factory-reset and diagnostics UI with v263 APIs; prove reset lock and verified restore on the integrated app.
7. Test the complete app on iPhone Safari, including reload, offline/update lifecycle and failure-closed behavior.
8. Only after all tests pass and the user explicitly authorizes release, update production entry/release files.

## Safety boundary

This is a source inventory only. No LocalStorage data was read from the user's device, changed, copied or deleted. No production file, release metadata or service worker was modified. No branch was created.
