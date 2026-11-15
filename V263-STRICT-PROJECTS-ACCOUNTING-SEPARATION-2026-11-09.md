# THA v263 — Strict Projects / Accounting Separation
Date: 2026-11-09
Status: Binding architecture rule for future v263 work

## User decision
Projects and Accounting must have absolutely no relationship. No automatic or manual transfer, shared record IDs, cross-domain references, project-to-accounting posting, or completion-triggered accounting action is permitted.

## Required boundaries
- Projects owns project records, sub-projects, project-local income/expense ledgers, project images, receipt images, and project-only reports.
- Accounting owns customers, invoices, accounting income/expense entries, accounting settings, and accounting-only reports.
- A project-local income/expense record remains inside Projects and is never copied or posted to Accounting.
- Completing, reopening, editing, or deleting a project must not read or mutate Accounting.
- Editing, deleting, restoring, or resetting Accounting must not read or mutate Projects.
- Project backup/restore contains only the Projects domain.
- Accounting backup/restore contains only the Accounting domain.
- No combined Projects+Accounting backup/restore package.
- No cross-domain IDs or foreign keys.

## Repository actions completed
1. Added `app-storage-v263-projects-only.js`, exposing only the `projects` domain and explicitly rejecting reads/writes to any other domain.
2. Added `storage-idb-v263-projects-only-engine.js`, with dedicated database `tha_v263_projects_only_lab_20261109_idb`.
3. Added `v263-projects-only-lab.html`, which loads only the projects-only engine, projects-only adapter, and Projects controller. It does not load accounting controllers or transfer services.
4. Removed `v263-project-accounting-transfer-atomic-v2.js`, the project-to-accounting transfer service.
5. Removed `v263-app-shell-lab.html`, a combined-domain laboratory that tested project/accounting transfer and combined snapshots.

## Test entry point
`https://thehandymanjob.github.io/accountancy-test/v263-projects-only-lab.html`

Expected build: `THA-263-PROJECTS-ONLY-LAB-1`
Expected database: `tha_v263_projects_only_lab_20261109_idb`
Expected checks: 12.

## Explicit non-approval
The Projects-only lab has been committed but has not yet been run by the user. The strict separation architecture is implemented in the isolated lab only. The production app entry point has not been modified, and the full production cutover remains unapproved.
