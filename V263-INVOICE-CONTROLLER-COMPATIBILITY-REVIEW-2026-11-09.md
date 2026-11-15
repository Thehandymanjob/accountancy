# THA v263 — invoice controller compatibility review
Date: 2026-11-09
Repository: Thehandymanjob/accountancy-test
Branch: main
Scope: read-only source review of the v263 adapter and invoice controllers. No app data read or modified.

## Confirmed adapter contract
`HandymanAppStorageV263.mutate(name, updater)` passes the current domain state to a synchronous updater and returns `{ok:true,state,...}`. Invoice sequence reservation is a separate IndexedDB record in the `sequences` domain and is exposed as `reserveInvoiceNumber(minimum)`.

## Findings
1. Two invoice workflow implementations currently coexist:
   - `v263-invoices-controller.js` exports `HandymanInvoicesV263`.
   - `v263-invoice-workflow-v263.js` exports `HandymanInvoiceWorkflowV263` and delegates to `HandymanAccountingV263`.
   They overlap on create/save, paid/unpaid and soft-delete behavior, but are not behaviorally identical. The real UI must select one canonical workflow; loading both does not establish which one owns invoice writes.
2. The existing `v263-invoice-lab1.html` loads and exercises `HandymanInvoicesV263`, not `HandymanInvoiceWorkflowV263`. Therefore its PASS evidence cannot be applied to the second controller.
3. The tested invoice controller's `create()` forces `paymentStatus: "unpaid"` for every newly created invoice. If the legacy UI allows creating an invoice already marked paid, that behavior must be handled explicitly by the UI workflow or covered by a separate tested operation.
4. The alternate workflow accepts a caller-supplied payment amount and writes it to income; the tested invoice controller computes the full invoice total itself. This is a material behavior difference for any partial-payment workflow.
5. Both controllers correctly keep invoice and linked income changes inside one Accounting-domain mutation; neither writes to Projects. The invoice sequence is reserved separately and must be tested for failed-create gaps and duplicate prevention before release.
6. The adapter's accounting scope permits the Accounting state and invoice sequence as separate domain operations. This does not create a multi-domain transaction. Do not claim invoice record plus sequence reservation is atomic.

## Required next checks before UI wiring
- Choose and document one canonical invoice controller.
- Compare every legacy invoice action: draft save, issue, edit, mark paid, mark unpaid, partial payment (if supported), delete/restore, print-after-save, customer auto-create, invoice number reservation.
- Add explicit tests for any supported partial-payment behavior and for a failed invoice save after number reservation.
- Ensure every real UI caller awaits the selected controller and refreshes the UI only after the IndexedDB result is confirmed.
- Keep this review isolated; do not load these controllers into the v262 UI as a shortcut.

## Release status
**Not integrated. Not a release candidate.** The v262 UI and its LocalStorage paths remain unchanged. Production remains untouched.
