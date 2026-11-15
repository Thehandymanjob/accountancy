# v250 — Last Backup Authority Audit

Date: 2026-11-07

## Authority and safety decision

The user has explicitly designated the uploaded `New_new(1).json` as the source of truth for migration. This audit is based on that file only.

- Backup: `New_new(1).json`
- Exported at: `2026-11-07T08:35:24.557Z`
- Backup type: `complete-user-data`
- Format version: 6
- Size: 1,898,878 bytes
- SHA-256: `07b6170db9169e3b59d0b4527b88e26d589bd18c178ec9a1b1975b55f403db90`

Do not select or merge business records from `handyman_accounting_v2`, `handyman_projects_workspace_v1`, `tha_restore_test_v1_*`, or `tha_v212_migration_*`. Those are candidate snapshots/test data, not the user's designated authority. They may be used only for diagnostic comparison, never as migration inputs unless the user explicitly changes this instruction.

The existing 40-key v250 `legacy` staging remains intact. No typed-domain records were written and no application cutover was performed during this audit.

## Backup structure

- Accounting: 22 entries (8 income, 14 expenses), 1 customer, 2 invoices, 1 custom expense category, settings object, 0 third-party transactions.
- Projects: 1 project, 1 worker, 1 partner, 1 contractor, 1 company, 0 company jobs.
- Contracts: 0 contracts.
- Duplicate-ID and financial discrepancies are recorded for reference only; they do not block migration. All source arrays and values are preserved as-is.
- Highest numbered accounting entry/invoice observed in this backup: 140. This is not a complete historical sequence audit; do not reset or lower any existing sequence. The previously observed candidate high-water mark 144 remains a conservative upper bound until reconciled with the authoritative backup and all retained legacy keys.

## Project financial audit (values preserved exactly)

The backup contains one project with seven subprojects. The project-level price is £11,700; the sum of the seven subproject prices is £17,400, a £5,700 difference. This difference is intentionally ignored for migration; both stored values are preserved exactly.

| Subproject | Price | Income records | Income total | Expense records | Expense total |
|---|---:|---:|---:|---:|---:|
| Roof (original) | £6,000 | 4 | £6,300 | 1 | £280 |
| Top floor | £4,500 | 2 | £3,000 | 0 | £0 |
| Porch roof | £1,000 | 1 | £700 | 0 | £0 |
| Plumbing | £200 | 1 | £200 | 0 | £0 |
| Roof (additional) | £3,000 | 1 | £2,000 | 0 | £0 |
| Basement | £200 | 0 | £0 | 0 | £0 |
| Bathroom | £2,500 | 0 | £0 | 0 | £0 |
| **Total** | **£17,400** | **10** | **£12,200** | **1** | **£280** |

The original Roof subproject includes a £300 receipt explicitly marked `receiptType: extra-work`; the £6,000 stored price has not been changed in this backup. Preserve the £300 receipt as one record and do not duplicate it. The second Roof is a separate £3,000 subproject with a £2,000 receipt. Do not collapse the two Roof records or combine their IDs.

The project's stored price (£11,700), subproject price total (£17,400), and project receipt total (£12,200) must all be preserved independently without attempting reconciliation. Do not auto-adjust the main project price or subproject prices during migration.

The accounting ledger's 8 income records total £6,150 and 14 expense records total £1,151.22. Project subproject receipts are a separate project-level ledger; do not add them to accounting income or treat them as duplicate accounting entries.

## Invoice and numbering audit

- Invoice 133: paid, £1,200, bank, payment date 2026-08-24.
- Invoice 134: paid, £600, bank, payment date 2026-10-19.
- Both invoices are retained exactly as in the designated backup.
- The backup contains numbered income entries through 140. The current migration must preserve all existing numbers and must not reuse numbers.
- Keep the sequence at least as high as the greatest independently verified source high-water mark. Do not lower any existing sequence during migration; preserve the current high-water value and all retained legacy keys.

## Migration mapping proposal (not yet executed)

- `data` accounting object → `accounting/main`
- `projects` object → `projects/main`
- `contracts` array → `contracts/main`
- Any separate application preferences, monitor logs, report archives, navigation state, recovery flags, and other LocalStorage keys not present in this complete-user-data backup must remain preserved in the existing `legacy` domain until their purpose and mapping are proven.

This mapping is a proposal for the next dry-run. It is not an executed migration. Discrepancies and duplicate IDs are not grounds for data correction or deletion.

## Required next gates

1. Build a backup-driven dry-run that accepts this exact backup format and validates the backup structure and records discrepancies without blocking migration.
2. Preserve all source objects byte-for-byte/semantically unchanged; no inferred merges, price corrections, date corrections, or number assignments.
3. Produce a per-domain manifest with source SHA-256, counts, record IDs, and destination keys.
4. Take a fresh v250 snapshot before any typed-domain write.
5. Write typed domains atomically, then read back and compare canonical hashes and record counts.
6. Keep all 40 staged legacy keys and the user's downloaded backup untouched through validation and rollback.
7. Do not modify production `accountancy/main`, create a new branch, or cut over the app until separately authorized.
