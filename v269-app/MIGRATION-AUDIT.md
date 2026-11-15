# v264 UI Migration Audit — refreshed 2026-11-10

## Status

**Static integration has advanced substantially. The candidate is not yet approved for production or important user data entry.** Safari runtime tests, backup/restore round-trip tests, and visual/PDF regression tests are still outstanding.

## Candidate identity and isolation

- Candidate path: `v264-app/index.html` in the `main` branch of the `accountancy-test` repository.
- Current index SHA: `4586863d89cda8124294a932c30a5a3c3c71ed00` at the time of this audit.
- The directory is named `v264-app`, but the HTML metadata still reports app version `262` and build `THA-262-RESTORE-ROLLBACK-REBUILD-20261108`. Do not describe this as a released version 264 yet.
- Production repository/root `index.html` has not been changed.
- The production updater was intentionally disabled in this test build. The root `version-manager.js` points to `release239` and must not be loaded by this candidate.

## Static verification performed

- All 7 non-empty inline JavaScript blocks in the candidate compile successfully.
- The v264 UI domain gateway compiles successfully.
- All 15 external script references resolve to files in `v264-app/` or `v264-fresh/`.
- All loaded external JavaScript modules compile successfully.
- Static scan of the active HTML and loaded modules found zero direct calls to `localStorage`, `sessionStorage`, `Storage.prototype`, or `document.cookie`.
- The old `storage-foundation.js` dependency and its LocalStorage inspection hooks were removed from the candidate.
- No runtime browser/Safari execution is implied by these static checks.

## Current UI-to-IndexedDB integration

| Area | Current integration |
|---|---|
| Accounting | UI state loads through the v264 gateway. The async `persist()` path waits for verified IndexedDB read-back. All 12 persistence call sites are awaited. |
| Projects | UI state loads through the gateway. All 31 `prPersist()` call sites are awaited. Failed saves restore the last verified project state. |
| Business Profile | Separate IndexedDB domain. Project/profile writes are coordinated by the gateway with rollback attempts and read-back verification. |
| Contracts | Async contract controller writes are read back and compared. Both contract write call sites are awaited. |
| Reports, notifications, report settings and workflow | Support controller writes are queued and awaited. All 13 report save call sites are awaited. Accountant recipient settings are stored under the report-settings domain. |
| Language preference and help-contact drafts | Both use the Support controller and a shared write queue. |
| Diagnostics | Monitor events are queued to the IndexedDB diagnostics domain. The full-backup barrier waits for the diagnostics queue. |
| Media | The media controller and media domain are loaded. Existing UI attachments are still represented in their owning records (for example, image data URLs); the separate media controller is not yet used by the legacy UI. The portable backup includes the media domain. |

## Backup and restore

- Full backup uses the v264 recovery module and covers 17 physical domains, including accounting, projects, contracts, business profile, sequences, preferences, diagnostics, reports, notifications, workflow, help-contact drafts and media.
- Backup encoding supports Blob, File, ArrayBuffer and typed-array data.
- Before backup or restore, the UI now waits for accounting, project, contract, report, Support and diagnostics write queues, then performs a gateway read barrier.
- Restore verifies the backup digest and compares the restored snapshot with the selected backup.
- These are code-path/static findings; a real iPhone Safari file export/import round trip remains required.

## Safety corrections made

- Removed the legacy startup cleanup that deleted accounting entries tagged as project-synced.
- Removed unused automatic project-to-accounting sync helpers. Completing a project now changes project status only; it does not silently create, delete or sync accounting entries.
- Removed hard-coded invoice 133/134 payment migration logic so a newly created invoice with those numbers is not incorrectly marked paid.
- Disabled the test build's update controls to prevent the candidate from downloading a production release from `release239`.

## Outstanding release blockers

1. Run the complete candidate on iPhone Safari and verify create, edit, delete, reload and read-back for accounting entries, customers, invoices, projects, sub-projects, contractors, contracts, business profile, reports, notifications and settings.
2. Test photos, logos, receipts, company/job attachments and any File/Blob values through save, reload, full backup and full restore.
3. Compare invoice, contract, project and financial-report print/PDF output against the previous working UI. CSS and print markup were not intentionally redesigned, but visual equivalence has not yet been demonstrated.
4. Confirm the product scope for the previously requested **Pay Contractor** action and explicit project-to-accounting transfer. No active `Pay Contractor` or `Transfer to Accounting` UI handler was found in this candidate. Project completion currently does not transfer accounting records.
5. Confirm whether partial invoice payments are required. The current UI payment modal records the full invoice total with date and method; it does not expose a partial-payment amount or payment schedule.
6. After all tests pass, set the release metadata/build identity to 264, prepare a dedicated release manifest/update channel, then move the verified candidate into Production. Do not enable the production updater before that step.

**Decision:** Continue integration and testing in the isolated test repository. Do not publish this candidate to Production yet.
