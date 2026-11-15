# Accounting and Invoice UI Cutover — refreshed 2026-11-10

## Status

The preserved Accounting and Invoice UI is now connected to the v264 IndexedDB gateway for its active CRUD paths. Static JavaScript compilation passes. The candidate is still awaiting iPhone Safari runtime tests and must not yet be treated as a production release.

## Accounting state

- `loadDB()` awaits `HandymanUIDomainGatewayV264.initialize()` and loads the accounting domain from IndexedDB.
- The UI's `db` object is an in-memory render model, not a durable browser-storage database.
- `persist()` is asynchronous. It snapshots the accounting state, awaits the gateway save, requires `ok === true` and `verified === true`, and reports failure without claiming success.
- All 12 active `persist()` call sites are awaited.
- Entry create/delete, customer create/delete, settings, invoice save/delete, payment marking and invoice-linked income changes await the persistence path and retain rollback logic for failed writes.
- Full backup waits for the accounting write queue and all other application-domain queues before snapshotting.

## Invoice workflow

- Invoice create/edit is asynchronous and awaits the accounting save/read-back.
- Invoice number reservations use the IndexedDB sequence controller. The high-water mark is reserved during accounting startup and after invoice save/delete/number repair operations.
- Mark-paid records the full invoice total as one linked income entry, with the selected payment date and method. Mark-unpaid removes the linked income entry and updates invoice status.
- The payment modal in this UI contains date and payment-method fields only. There is no partial-payment amount, staged-payment history or deposit schedule in this source. Do not claim partial-payment support.
- Hard-coded legacy handling for invoice numbers 133 and 134 was removed. New invoices with those numbers are no longer treated as pre-existing test records or automatically marked paid.
- The unused invoice-number repair helper is async and awaits both the accounting write and sequence reservations.

## Project/accounting separation

- The old automatic project-to-accounting sync helper functions and startup cleanup were removed.
- Project completion changes project status only. It does not create, delete or sync accounting entries.
- No active Transfer to Accounting or Pay Contractor UI handler was found in this candidate. Those workflows remain outside the completed cutover and require an explicit product decision/implementation before release if they are still required.

## Remaining tests

1. Create/edit/delete an income entry and expense entry; reload and verify exact amounts, dates, payment methods, categories, notes and receipt images.
2. Create/edit/delete a customer; verify stable customer IDs and invoice references.
3. Create/edit/issue/soft-delete an invoice; verify number reservation and linked income behavior.
4. Mark an invoice paid and unpaid; verify no duplicate income entry is created.
5. Test backup/restore with invoices, receipts and other binary/image data.
6. Compare invoice PDF/print output against the previous working version.
7. Confirm Safari quota, blocked IndexedDB, reload and interrupted-write behavior.

**Important:** the candidate directory is named `v264-app`, but the current HTML metadata still says version 262. Set version/build metadata only after the complete candidate passes testing.
