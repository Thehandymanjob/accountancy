# V263 Migration Work Map — Contracts and Support Domains
Date: 2026-11-09
Branch: main
Scope: read-only source inspection and migration classification. No application runtime code or user data was changed.

## Governing architecture
Projects and Accounting are strictly independent:
- no automatic or manual transfer;
- no shared record IDs, foreign keys, posting references, or cross-domain mutations;
- project-local income/expenses remain within Projects;
- Accounting records remain within Accounting;
- completion, deletion, reset, backup, and restore are domain-local.

The production entry point remains v262 and LocalStorage-authoritative. V263 is not yet wired into index.html. Cutover is not approved.

## Findings from the current application entry point

### 1. Contracts
Observed in index.html:
- Contracts are stored under LocalStorage key `tha_test226_contracts_v1` (`CT_KEY`).
- `ctRead()` and `ctWrite()` synchronously read/write the full contracts array.
- Contract fields currently include ID, document type, title, date, customer/contact/address, price, start date, body and update timestamp.
- The print path `ctProfile()` reads `tha_test226_projects_v1` and takes `profile` from the Projects object; `ctBuildPrint()` uses that profile for business logo/name/contact details.
- This is a real Contracts -> Projects storage dependency, even though the contract records themselves are held under a separate key.

Migration decision:
- Contracts must not read Projects to render a contract.
- Business identity/branding used by contract printing needs an explicitly owned, independent profile source (or a user-entered snapshot stored with each contract).
- Do not silently copy Projects profile fields into Contracts during migration; preserve source data and define a reversible mapping first.
- Existing contract attachments or embedded media must be preserved exactly; the currently inspected contract form data does not establish that all historical contract payload shapes have been inventoried.

### 2. Company Contracts & Jobs inside Projects
Observed in index.html:
- Companies and company jobs are stored inside the Projects object (`prDB.companies`, `prDB.companyJobs`).
- Job packages, package expenses, payments and their attachments are also nested in this Projects data.
- Company job payment records currently create `accountingEntryId:null`; the payment UI recognises a legacy accounting link if that field is populated.
- Work-package deletion is blocked when `accountingEntryId` exists.
- Payment recording itself writes only to Projects and explicitly says no Accounting entry is created.
- Some legacy records may still contain `accountingEntryId`; this is a historical cross-domain pointer and must not be followed, recreated, or used as a dependency under the approved architecture.

Migration decision:
- Keep companies, jobs, packages, expenses, payments and their attachments entirely within Projects.
- Treat `accountingEntryId` as a legacy field for audit/migration review only. Do not resolve it against Accounting. Remove the runtime dependency in a separately reviewed code change after a preservation strategy for the raw legacy value is agreed.
- No payment or package action may read/write Accounting.

### 3. Reports and report notifications
Observed in index.html:
- Report archive, report notifications, report settings and report workflow use four separate LocalStorage keys:
  - `tha_test226_report_archive_v1`
  - `tha_test226_report_notifications_v1`
  - `tha_test226_report_settings_v1`
  - `tha_test226_report_workflow_v1`
- They are loaded and saved independently by the report workspace.
- The current v263 adapter has corresponding logical domains: `reports`, `reportNotifications`, `reportSettings`, `reportWorkflow`.
- The support controller groups these four into one atomic report-workspace save/load operation.

Migration decision:
- Keep these support records outside both Projects and Accounting.
- Preserve the four distinct data sets and their contents; the V263 adapter may transact within this report-workspace group, but must not include Projects or Accounting in the same backup/restore package.
- Before cutover, inspect every report field for embedded references or copied financial/project data; do not infer independence merely from the storage key.

### 4. Preferences, diagnostics, notifications and recovery
Observed:
- The V263 support controller exposes preferences, preference metadata, diagnostics, reports, report notifications/settings/workflow, notifications, recovery and factory-reset recovery.
- The existing application entry point still has LocalStorage usage for monitoring/diagnostics and recovery paths.
- The support controller itself is not loaded by index.html.
- No live UI cutover to these support domains is established by the isolated labs.

Migration decision:
- Keep support domains independently owned and independently recoverable.
- Define separate export/restore/reset boundaries for each support family or explicitly documented support bundle.
- Do not make a combined Projects+Accounting backup or restore.
- Audit exact current LocalStorage keys and all read/write call sites before implementing a mapping. The adapter's logical domain names alone do not prove a complete migration.

## Cutover blockers
1. index.html still declares app version 262 and remains LocalStorage-authoritative.
2. V263 engine, adapter and controllers are not loaded by index.html.
3. Contracts print branding currently reads Projects profile.
4. Company job payment data has a legacy Accounting pointer field.
5. All remaining LocalStorage call sites for accounting, projects, contracts, reports, notifications, settings, diagnostics, backup, restore and reset must be mapped.
6. A read-only migration rehearsal against a copy of the user's backup is still required.
7. Assets require explicit byte/content verification: business logo, project and subproject photos, receipts, contract/job/package/payment attachments, and report files.
8. Domain-local backup, restore, reset and rollback must be verified separately.
9. No production entry point or user data may be changed until the user explicitly approves cutover.

## Completed isolated evidence (not production migration proof)
- Projects-only lab 4: 12/12 checks passed in its dedicated IndexedDB database.
- Accounting-only lab 1: 12/12 checks passed in its separate dedicated IndexedDB database.
- Total: 24/24 isolated checks.
- These results prove only the tested controllers/adapters and isolated database behaviors. They do not prove UI wiring, legacy-data migration, or production cutover.

## Next implementation sequence
1. Finish source inventory and map every LocalStorage key to exactly one owner: Projects, Accounting, Contracts, or independent support.
2. Resolve the Contracts branding dependency without reading Projects at runtime.
3. Remove legacy project/accounting pointer behavior from Company Contracts & Jobs while retaining a migration audit trail for existing raw values.
4. Implement domain-local adapters and backup/restore paths for Contracts and support domains.
5. Build the migration importer to read a user-supplied backup copy, classify records by owner, and produce a non-destructive reconciliation report before any writes.
6. Validate record counts, IDs, totals, unknown fields and media bytes against the source copy.
7. Only after explicit user approval, plan production cutover. Until then, index.html and production data remain unchanged.
