# THA v263 — legacy invoice behavior and cutover contract
Date: 2026-11-09
Repository: Thehandymanjob/accountancy-test
Branch: main
Status: static source analysis; no runtime or user-data changes.

## Source-derived current UI behavior
Reviewed the v262 invoice editor, save, payment, delete, print and list functions in `v263-candidate/index.html`.

### Draft and issued semantics
- New invoice opens as `status: draft`, `paymentStatus: unpaid`.
- Draft status hides payment controls and forces unpaid.
- Changing status to `issued` currently defaults the payment selector to `paid`, fills today's date and defaults method to bank.
- The save function independently derives `paymentStatus`: draft => unpaid; issued => the payment selector (paid or unpaid).
- A paid invoice creates or replaces exactly one linked Accounting income entry for the full invoice total.
- An unpaid invoice removes any previous linked income entry.
- Existing invoice editing preserves the invoice ID and existing creation timestamp through object spread / update behavior.
- Customer selection may auto-create a customer when no matching customer is selected or found by the existing name/phone/address matching rule.
- Invoice number remains reserved after deletion.
- Delete is a soft delete: set `deletedAt` and `deleted=true`, remove the linked income entry, retain the invoice record and number.
- Printing does not itself create an income entry. The current print path may normalize a paid draft to issued in memory and persist it.

### Payment behavior
- The UI exposes a binary paid/unpaid state, not partial payments.
- Mark paid uses the full invoice total, payment date and either bank or cash.
- Mark unpaid removes the invoice-linked income entry.
- Duplicate detection recognizes links by invoiceId, reference and generated income ID; the old delete function also has a notes-based fallback.
- Payment changes are Accounting-only. There is no Projects write in the invoice workflow.

## Controller selection assessment
Two candidate APIs exist:
- `HandymanInvoicesV263`: has load/create/update/recordPayment/markUnpaid/softDelete and computes the full invoice total itself for mark-paid. Its create method always initializes payment as unpaid, so an issued-and-paid save must be composed from create/update followed by recordPayment; that composition is not one atomic write.
- `HandymanInvoiceWorkflowV263`: has saveInvoice(invoice, payment), markPaid, markUnpaid and softDelete. It performs invoice and linked-income changes inside one Accounting state mutation, and can accept a payment amount. The current UI only supports full payment, so the adapter must pass the computed invoice total; partial payments must not be exposed unless product behavior is deliberately changed.

**Recommended UI write path:** use `HandymanInvoiceWorkflowV263` as the single invoice mutation owner for save, paid/unpaid and soft-delete operations. Do not load both write APIs into the live UI. Use `HandymanAccountingV263.load()` (or a single read facade) for invoice/customer list reads. This is a recommendation based on the existing UI's full-payment behavior and the workflow's atomic invoice+income mutation.

## Required safeguards before wiring
1. Implement and test a single invoice view-model mapper from current form fields to the workflow's invoice shape. Preserve current customer matching/auto-create behavior and stable IDs.
2. For a save with `paymentStatus=paid`, pass a payment object whose amount equals the exact calculated invoice total; date and method must be validated.
3. For draft/unpaid saves, pass no payment object and explicitly set `paymentStatus=unpaid`, clearing stale payment date/method where appropriate.
4. The current workflow's `markUnpaid` and `softDelete` must clear paymentDate/paymentMethod consistently; its `saveInvoice` must normalize the unpaid case and avoid stale linked income when an already-paid invoice is edited to unpaid.
5. Preserve the legacy notes-based linked-income match as a cautious duplicate cleanup rule, but only when it identifies the exact invoice number and does not capture unrelated income.
6. Preserve invoice number after soft delete; do not reuse numbers. A failed create after number reservation may leave a gap, which is safer than reusing a number.
7. Add restore-from-Deleted behavior only after confirming the existing UI's exact restore semantics. Current inspected code establishes soft delete, but not a complete restore workflow.
8. Keep printing/preview separate from persistence. Never mutate status just to render a PDF.

## Integration gate
No invoice UI call site has been converted in this commit. The candidate remains a v262 UI and is not a release candidate. Root/production remain untouched.
