# THA v263 — Strict Projects / Accounting Independence Evidence
Date: 2026-11-09
Branch: main
Status: ISOLATED DOMAIN TESTS PASSED — APPLICATION CUTOVER NOT APPROVED

## User-approved architecture
Projects and Accounting are completely independent. No automatic or manual transfer, shared IDs, cross-domain references, foreign keys, or combined backup/restore. Completing, reopening, editing, deleting, backing up, or restoring a Project must not access Accounting. Accounting operations must not access Projects.

## Projects-only evidence
- Lab: `v263-projects-only-lab-4.html`
- Build: `THA-263-PROJECTS-ONLY-LAB-4`
- Database: `tha_v263_projects_only_lab4_20261109_idb`
- Result supplied by user: 12/12 checks passed.
- Verified: projects-only initialization; only projects domain exposed; no accounting controller/invoice workflow/transfer service; project photo and receipt Blob persistence; 8 concurrent subproject additions retained; subproject-local income £300 and expenses £40; accounting read/write rejection; completion only mutates project state; projects-only backup; restore removes post-backup marker and preserves Blob; foreign accounting-domain backup rejected; healthy projects-only database.
- Flags: synthetic data only; no legacy storage; no production access.

## Accounting-only evidence
- Lab: `v263-accounting-only-lab.html`
- Build: `THA-263-ACCOUNTING-ONLY-LAB-1`
- Database: `tha_v263_accounting_only_lab_20261109_idb`
- Result supplied by user: 12/12 checks passed.
- Verified: accounting-only initialization; only accounting domain exposed; no Projects controller/transfer service; customer, expense, receipt Blob and metadata persistence; 10 concurrent unique contiguous invoice numbers; invoice number 11, attachment Blob and custom metadata; invoice payment and exactly one linked income entry; Projects read/write rejection; accounting-only backup; restore removes post-backup marker and preserves receipt/invoice Blobs and paid status; foreign Projects-domain backup rejected; healthy accounting-only database.
- Flags: synthetic data only; no legacy storage; no production access.

## Combined evidence summary
- Projects-only: 12/12.
- Accounting-only: 12/12.
- Total: 24/24 across two separate isolated databases.
- Database names are distinct and each lab exposes exactly one permitted domain.
- No test accessed production or legacy LocalStorage.

## Scope and limitations
These results prove the tested controllers, adapters, and backup/restore paths in their respective isolated labs. They do NOT prove that the live application has been migrated to IndexedDB, that all production UI flows are wired to these controllers, or that all other application domains have been integrated. The current application entry point remains outside this approval. No production files were changed.

## Next gate before any cutover
1. Inventory every application data domain and classify it as Projects-only, Accounting-only, or independent support data.
2. Verify contracts, preferences, reports, notifications, recovery, settings, diagnostics, and media ownership without creating cross-links between Projects and Accounting.
3. Build separate end-to-end UI integration paths for Projects and Accounting, preserving the strict domain boundary.
4. Test independent export/import, reset, recovery, and failure rollback for each domain.
5. Test backup compatibility and complete restoration of all user assets (logos, project photos, receipt scans, invoice/contract attachments, reports).
6. Run a read-only migration rehearsal against a user-provided backup copy; never modify the original backup.
7. Obtain explicit user approval before changing production entry point or performing live data migration.

