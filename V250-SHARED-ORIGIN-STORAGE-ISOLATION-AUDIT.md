# v250 — Shared-Origin Storage Isolation Audit

Date: 2026-11-07  
Repository: `Thehandymanjob/accountancy-test`  
Branch: `release239`  
Scope: static source and URL-origin analysis only

## Finding

The GitHub Pages URLs

- `https://thehandymanjob.github.io/accountancy/`
- `https://thehandymanjob.github.io/accountancy-test/`

have the same web origin: `https://thehandymanjob.github.io`.

Browser storage is scoped to the origin, not to the URL path. Consequently:

- Both paths share the same LocalStorage area.
- Both paths share IndexedDB databases opened under the same database name.
- A database named `the_handyman_accountancy_v250_idb` is not isolated merely because the page was loaded from `/accountancy-test/`.
- A test page can observe or modify origin-wide storage also used by the production path if it uses the same keys/database names.

This means the test path is not a separate browser-storage sandbox. The assumption that `accountancy-test` has isolated LocalStorage or IndexedDB is incorrect.

## Verified v250 repository details

- The v250 repository module opens IndexedDB database `the_handyman_accountancy_v250_idb`.
- The repository module does not itself read or write LocalStorage.
- The legacy staging module explicitly reads LocalStorage key names and values and stages exact raw strings in the repository's `legacy` domain.
- The application `index.html` v250 baseline is still not loading the v250 repository module; no app cutover has occurred.
- No production `index.html` or `main` branch changes were made as part of this audit.

## Inventory discrepancy — unresolved

A user-provided diagnostic previously reported 40 LocalStorage keys and 40 legacy records, with exact key-name agreement. A later user-provided diagnostic reported 29 LocalStorage keys and 29 legacy records, again with exact key-name agreement.

The later result proves only that the then-current LocalStorage key names matched the then-current staged legacy record names. It does not prove what happened to the earlier inventory. The reports contain different key names; the difference must not be described simply as eleven deletions without a full exact comparison of both captured inventories.

The user reports that no Restore or Factory Reset was run between the two observations. Therefore those actions are not an established explanation. Shared-origin access is a confirmed architectural risk and a plausible contributor, but it is not proof of the precise event that changed the inventory.

## Safety decision

- Do not run the guarded backup import yet.
- Do not weaken the import guard from 40 to 29 merely to make Prepare pass.
- Do not delete, merge, rename, deduplicate, or repair any LocalStorage or IndexedDB records.
- Keep the authoritative backup `New_new(1).json` unchanged.
- Preserve the current 29 staged legacy records exactly as they are.
- Preserve the earlier downloaded legacy snapshot; it may be needed to recover the earlier 40-record inventory.
- Keep `index.html` and the production repository/branch untouched.

## Required design correction before future browser testing

A GitHub Pages path is not a storage-isolation boundary. Future testing that needs isolated browser storage must use a genuinely different origin (for example, a separate host/subdomain), or use an explicitly designed and reviewed storage namespace/database strategy. Merely changing the path or cache-busting query string is insufficient.

Any future isolation change must be designed so that it cannot silently read, overwrite, or migrate the production user's LocalStorage or IndexedDB. Do not implement an origin/storage migration as part of this audit.

## Current status

Investigation only. No business data was read by this static audit, no browser storage was changed by this audit, no backup was imported, and no application cutover was performed.


## Uploaded legacy snapshot comparison (user-provided file)

File: `THA-v250-legacy-snapshot.json`  
Snapshot timestamp: `2026-11-07T14:52:40.708Z`  
Database: `the_handyman_accountancy_v250_idb`  
Domain: `legacy` only  
File size: 4,384,242 bytes  
Records in snapshot: 40

The uploaded snapshot has been parsed successfully. Comparing its 40 exact record keys with the 29-key current inventory supplied by the user gives:

- Present in snapshot but absent from the later current inventory: **14** keys.
- Present in later current inventory but absent from snapshot: **3** keys.
- Net change: 40 - 14 + 3 = **29**.

### 14 keys present only in the uploaded snapshot

- `handyman_projects_workspace_v1`
- `tha_baseline_v167_isolated_20261030`
- `tha_recovery_lab_v1_a`
- `tha_recovery_lab_v1_c`
- `tha_recovery_lab_v1_p`
- `tha_restore_test_v1_report_archive_v1`
- `tha_v212_migration_accounting_v1`
- `tha_v212_migration_app_language_pref_version_v1`
- `tha_v212_migration_app_language_v1`
- `tha_v212_migration_contracts_v1`
- `tha_v212_migration_invoice_sequence_v1`
- `tha_v212_migration_monitor_log_v1`
- `tha_v212_migration_projects_v1`
- `tha_v212_migration_report_notifications_v1`

### 3 keys present in the later inventory but absent from the snapshot

- `tha_test226_factory_reset_recovery_v1`
- `tha_test226_projects_v1`
- `tha_v206_projects_v1`

### Data-preservation significance

The 14 snapshot-only keys are not all empty markers. Examples:

- `tha_v212_migration_projects_v1`: 1,487,153 raw bytes; contains one project with five subprojects, including `Extended roof` priced at 3,000.
- `tha_restore_test_v1_projects_v1`: 1,486,643 raw bytes; contains the same parent project identity but four subprojects. It is not byte-identical to the v212 migration copy.
- `handyman_projects_workspace_v1`: 391,308 raw bytes; contains a project workspace representation with three subprojects.
- `tha_restore_test_v1_report_archive_v1`: 389,053 raw bytes.
- `tha_v212_migration_accounting_v1`: 6,696 raw bytes, with 23 entries, one customer, two invoices, one custom expense category and settings.
- `tha_v212_migration_monitor_log_v1`: 114,089 raw bytes, 377 events.

These are distinct stored snapshots/keys. Similar names or project IDs do not make them interchangeable. In particular, the project copies differ in content and subproject count. Do not select one as canonical, merge them, or discard any copy automatically.

### What this proves and does not prove

It proves that the uploaded snapshot preserves an earlier 40-record legacy inventory and that the later reported 29-key inventory is a different key set, not merely the same set with eleven records removed.

It does **not** identify the exact browser action or script that changed the key set. The later three keys could have been created after the snapshot; the snapshot cannot show their values because they were not present at its capture time. The current compare report checked key names only, not LocalStorage values.

### Required next step

Preserve the uploaded 40-record snapshot unchanged. Before importing the authoritative `New_new(1).json` backup, obtain a fresh read-only export of the current 29 legacy records (including raw values), then compare it with this 40-record snapshot. Keep all 40 historical records and all 29 current records available as separate evidence; do not merge them into business domains or remove duplicates until the user explicitly approves a record-by-record mapping.


## Follow-up: current legacy export captured at 18:30 UTC

A second user-provided export was received from the newly added read-only export button.

- File: `1(1).json`
- Snapshot timestamp: `2026-11-07T18:30:13.159Z`
- File size: 4,384,242 bytes
- Records: 40; unique keys: 40
- Database: `the_handyman_accountancy_v250_idb`
- Domain: `legacy` only

It was compared programmatically against the earlier 14:52 snapshot (`THA-v250-legacy-snapshot.json`):

- Earlier snapshot: 40 records.
- 18:30 snapshot: 40 records.
- Key-set difference: **none** (all 40 keys match exactly).
- Raw-value difference: **none** (all 40 raw strings match byte-for-byte).
- Thus all 40 legacy records and their raw values persisted unchanged between these two IndexedDB snapshots.

This new evidence supersedes the earlier tentative comparison that treated the 29-key Inspect/Compare output as the current IndexedDB inventory. The 18:30 export directly reads the IndexedDB `legacy` domain and shows 40 records. The earlier 29-key report remains an observed diagnostic output, but it is not evidence that the current IndexedDB legacy domain permanently lost 11 records. Its discrepancy remains unexplained; do not infer that a restore/factory-reset occurred.

Important limitation: this export contains only IndexedDB legacy records. It does **not** inspect or compare current LocalStorage raw values. Therefore it confirms IndexedDB legacy preservation, not LocalStorage parity.

Next safe step: retain both exports and the exact 40 raw values. Re-run the read-only LocalStorage key-name comparison separately, then if needed add a read-only value-level comparator. Do not alter the guarded importer, do not relax the 40-key condition, do not import yet, and do not cut over the app.
