# THA v263 Real UI Integration Gate — 2026-11-09

## Status

**BLOCKED — no real application UI has been migrated to the v263 IndexedDB controllers.**

The isolated canonical invoice workflow lab passed 13/13 checks on 2026-11-09. That result validates the controller API in its dedicated lab database only. It does not validate the copied candidate UI or a user-facing release.

## Static inspection of `v263-candidate/index.html`

Fetched from `main` at blob SHA `f0bf55b46171ff2141cf258168e52dad064b0772`.

- File size: 663,103 characters.
- External scripts: `storage-foundation.js` and `version-manager.js`.
- The candidate HTML does **not** load `HandymanAppStorageV263`, `HandymanAccountingV263`, or `HandymanInvoiceWorkflowV263`.
- The candidate HTML still has 105 textual `localStorage` references:
  - 55 `localStorage.getItem`
  - 26 `localStorage.setItem`
  - 11 `localStorage.removeItem`
  - 8 `window.localStorage` references (overlapping the above)
- 17 references to `HandymanStorageFoundation`.
- 17 references to `__thaAccountingIdbShadowQueue`.
- `loadDB()` reads Accounting from LocalStorage.
- `persist()` writes LocalStorage as the authoritative source, then queues a shadow write to IndexedDB.
- The invoice save, mark-paid, mark-unpaid, and delete UI functions still mutate the shared in-memory `db` and call `persist()`.

## Invoice UI call sites inspected

- `saveInvoice()`: writes invoice/customer/linked-income into `db`; invokes `persist()`; then compares a shadow IndexedDB copy.
- `saveInvoicePaidPayment()`: mutates invoice and income in `db`; invokes `persist()`; then verifies shadow copy.
- `markInvoiceUnpaid()`: mutates invoice and entries in `db`; invokes `persist()`.
- `deleteInvoice()`: soft-deletes in `db`; invokes `persist()`.
- `printInvoice()` / `invoiceHTML()`: render from legacy in-memory `db` and profile objects.

These functions are not wired to `HandymanInvoiceWorkflowV263`.

## Required before any real UI cutover

1. Establish an asynchronous boot sequence that loads each domain from its v263 controller before rendering; remove LocalStorage as a read/write source.
2. Replace all Accounting mutations, including entry/customer/invoice CRUD, payment, reports, settings, and sequence reservation with awaited IndexedDB domain operations.
3. Replace Projects, Contracts, Business Profile, preferences, reports, notifications, diagnostics, recovery, and media access through their respective controllers.
4. Preserve invoice/customer matching semantics, invoice numbering, printing, soft deletion, and linked-income behavior.
5. Keep Projects and Accounting independent; do not reintroduce implicit transfers or cross-domain writes.
6. Verify Backup & Restore for every domain and Blob/File media (logos, project photos, receipts, contract attachments, reports) before cutover.
7. Remove the old shadow adapter and all executable LocalStorage/SessionStorage access from the candidate runtime, except a separately approved and read-only legacy import path if one is later explicitly designed.
8. Run full UI regression tests on iPhone Safari against an isolated test database. Production remains untouched until explicit authorization.

## Safety decision

Do not add the v263 invoice workflow script to the current candidate HTML as a superficial integration. The existing UI still calls the legacy synchronous persistence path. Loading the new controller without replacing those call sites would leave two competing write paths and could create divergence.

No application HTML, production root, production database, or user data was modified during this audit.
