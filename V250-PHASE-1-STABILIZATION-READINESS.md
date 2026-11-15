# THA v250 — Phase 1 Stabilization and Cutover Readiness

Date: 2026-11-07  
Repository: `Thehandymanjob/accountancy-test`  
Branch: `release239`  
Application baseline: `index.html` v250  
Baseline blob SHA: `f6bdb6a31fd9e424ca0464b5fb725c4ad0fb2315`  
Repository module: `storage-repository.js`  
Repository blob SHA: `a9d539a78cbd871e7b4276237a26dda12a110983`

## 1. Phase 1 result

The v250 application source is present on the approved test branch and is the baseline for the migration. It is not yet an IndexedDB-backed application. The v250 IndexedDB repository exists as a separate module and is not loaded by `index.html`.

This phase is therefore **baseline verification and migration-safety analysis**, not a claim that the application has already been stabilized or converted. No application data was read or changed by this static source audit.

## 2. Source integrity

- `index.html`: 647,160 characters; 2,899 lines; app-version metadata is `250`.
- The exact source SHA is recorded above.
- `storage-repository.js` is an isolated asynchronous repository using database `the_handyman_accountancy_v250_idb`, schema version 1.
- The repository module is not referenced by `index.html`.
- The existing UI self-test calls `HandymanStorageFoundation`, the older test226 foundation, not `HandymanV250Repository`.
- Existing user-reported repository self-test passed its 12 expected checks. That is a user-provided browser result; this static audit did not rerun Safari IndexedDB.

## 3. Persistence surface found in v250

A fresh scan of `index.html` found 40 source lines with direct LocalStorage method calls, plus a separate storage instrumentation layer. This count is source lines, not individual operations. The main persistence surfaces are:

| Area | Existing behavior | Required v250 treatment |
|---|---|---|
| Accounting | Synchronous load/save and read-back verification | Async repository load/save; do not show success until commit and read-back pass |
| Projects | Separate project workspace and persistence lock | Async repository operations; preserve exact project/subproject payload |
| Contracts | Separate list with validation and rollback | Async repository operations; preserve complete contract records |
| Invoice/income numbering | Shared sequence key, cleanup flags and startup reservation | Atomic counter protocol; never reset, reuse, or renumber existing records during migration |
| Startup | Runs cleanup, assignment and writes immediately after load | Separate read-only load/validation from explicit migrations; no startup mutation before verified data load |
| Backup/restore | Several independent LocalStorage paths | One consistent multi-domain snapshot and restore protocol |
| Factory reset | Writes recovery record, then removes selected keys | Must be redesigned around verified snapshot and transactional/compensating recovery |
| Project completion | Direct LocalStorage write bypassing project persistence helper | Must use the same awaited repository write path |
| Report archive/workflow | Generic dynamic-key load/save helper | Map every exact key and caller to repository domain/key; no LocalStorage fallback after cutover |
| Language | Preference and preference-version keys; startup may reset language | Migrate both values together and preserve selected language |
| Monitor/diagnostics | Monitor log, Storage.prototype hooks, LocalStorage write self-check | Separate diagnostic domain and repository-native health checks; no fake LocalStorage success signal |

## 4. Exact dynamic report-storage keys

The report module uses a generic synchronous `load(key, fallback)` / `save(key, value)` helper. The visible callers include archive, notifications, workflow, settings and accountant email settings. These keys must be explicitly mapped; a generic dynamic-key bridge must not silently route unknown keys into business records.

- `tha_test226_report_archive_v1`
- `tha_test226_report_notifications_v1`
- `tha_test226_report_settings_v1`
- `tha_test226_report_workflow_v1`
- `tha_test226_report_email_settings_v1`

Other known keys include accounting, projects, contracts, invoice sequence, cleanup markers, factory-reset recovery, monitor log, language and language-version preference. The 40-key legacy capture remains the preservation layer for any unmapped keys.

## 5. Critical correctness blockers before cutover

1. **Async call graph:** existing handlers assume synchronous reads and writes. Merely loading the IndexedDB script or replacing `localStorage` calls is insufficient. Each caller must await repository completion, handle rejection, and preserve its current UI state on failure.
2. **Startup write barrier:** startup currently mutates accounting records and sequence markers. Conversion must finish and pass read-back checks before any normal startup normalization is allowed. For the first migrated launch, no cleanup/repair/renumbering should run.
3. **Shared number sequence:** invoice and income numbers share a high-water mark. Number reservation and corresponding record creation need a safe atomic strategy; historical numbers must remain unchanged.
4. **Multi-domain consistency:** accounting, project workspace and contracts must be snapshotted and restored as one logical backup. The existing repository's `mutateMany` supports atomic record mutations, but all app flows still need to use it correctly.
5. **Direct project completion write:** this path currently bypasses the project's main persistence helper and can lose or diverge from changes after async conversion.
6. **Restore semantics:** existing restore code normalizes project prices and merges company/company-job records. That behavior must not be reused for this exact-preservation migration. The migration path must store the selected backup payload unchanged.
7. **Factory reset:** destructive reset must be disabled until recovery snapshot creation, download/verification, and restore behavior are redesigned and tested.
8. **Diagnostics:** the current IndexedDB self-test targets the old foundation. It must be clearly separated from the v250 repository self-test.

## 6. Required implementation sequence

### 1A — Baseline freeze
- Keep v250 `index.html` unchanged while completing the async call-site map.
- Keep work only on `release239`; do not create branches.
- Keep production repository `main` untouched.
- Preserve LocalStorage and all 40 staged legacy values.

### 1B — Repository integration layer
- Load the v250 repository explicitly.
- Add a single application storage adapter with typed methods for accounting, projects, contracts, settings, reports, diagnostics and counters.
- Make initialization asynchronous and expose a clear ready/failure state.
- Do not add a fallback that writes business data back to LocalStorage.

### 1C — Refactor and test one domain at a time
- Accounting load/save and invoice/income number reservation.
- Projects and subprojects, including completion and contractor/partner flows.
- Contracts.
- Settings, language, report archive/workflow/email settings.
- Diagnostics and monitor.
- Backup, restore and factory reset last.

### 1D — Full parity and failure testing
- Compare every migrated payload against the approved source snapshot without normalization.
- Test reload, concurrent writes, failed transactions, quota/error handling, offline use, backup/restore, and all CRUD screens.
- Confirm that no business-data LocalStorage access remains in application code.
- Confirm that the 40 legacy values remain preserved until an explicit later cleanup decision.

### 1E — Separate cutover approval
- Only after all tests pass, request explicit approval for the final test-app cutover.
- Production `main` remains untouched unless separately authorized.

## 7. Non-actions in this phase

- No LocalStorage key was changed, removed, or cleared.
- No typed business record was written by this audit.
- No backup was imported.
- No application cutover was performed.
- No production file was changed.
- No new branch was created.

## 8. Phase status

**Baseline v250 verified. Full IndexedDB application stabilization is not yet complete.** The next coding task is the asynchronous storage adapter and controlled initialization, while keeping the existing v250 app file available as the untouched baseline for comparison and rollback.
