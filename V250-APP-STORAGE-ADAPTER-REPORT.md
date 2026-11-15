# THA v250 — Application Storage Adapter Implementation Report

Date: 2026-11-07  
Repository: `Thehandymanjob/accountancy-test`  
Branch: `release239`

## Files added

1. `storage-v250-app-adapter.js` — isolated asynchronous application adapter.
2. `storage-v250-app-adapter-lab.html` — separate test page; does not load or modify the application `index.html`.

## Adapter responsibilities

The adapter uses only the v250 repository API and defines explicit domains:
- `accounting`
- `projects`
- `contracts`
- `settings`
- `reports`
- `diagnostics`
- `counters`
- `legacy` (protected from typed application read/write methods)

It provides explicit asynchronous methods for loading and saving accounting, projects, contracts, settings, report data and diagnostics. Report storage keys are explicitly mapped rather than accepted as arbitrary keys.

The adapter's `initialize()` method:
1. Verifies the exact v250 repository database.
2. Awaits repository readiness and health.
3. Reads the three canonical business records: `accounting/main`, `projects/main`, `contracts/main`.
4. Performs no business-data write and does not access LocalStorage.

The adapter also provides a shared invoice/income number mutation method. It calculates the next number from both existing invoice numbers and income-entry numbers plus the stored counter, then writes the updated accounting payload and counter in one `mutateMany` transaction. It refuses to create a blank accounting database if the imported accounting payload is absent.

A full snapshot method requires the caller to explicitly include the preserved `legacy` domain.

## Verification performed

- Adapter JavaScript parsed successfully with `new Function`.
- Simulated repository initialization confirmed zero writes.
- Simulated reads of all three typed domains completed without writes.
- Simulated shared number transaction returned the next number after the maximum existing invoice/income number and persisted the changed accounting payload.
- Typed adapter rejected direct access to the protected `legacy` domain.
- No production repository or branch was modified.
- No new branch was created.

These are isolated logic tests using a simulated repository, **not** a real Safari IndexedDB browser test. The separate lab page provides the next browser-level checks after GitHub Pages deploys.

## Deliberate limitations

- The adapter is not loaded by `index.html`.
- No application event handler has been refactored to await it yet.
- No typed business records have been imported or changed by this implementation.
- No LocalStorage key was changed or deleted.
- No cutover was performed.
- Existing synchronous app flows remain on LocalStorage until each call path is deliberately refactored and tested.
- The adapter's numbered mutation API is a building block; the app's invoice and income creation handlers must be refactored to use the single atomic operation before the shared counter is considered migrated.

## Next implementation step

Use the isolated lab page in Safari to verify the real repository initialization and 12 repository self-test checks. Then refactor the accounting core's startup/load/save and numbered-record creation flow to await the adapter, behind a controlled initialization barrier. Keep the old `index.html` baseline unchanged until that refactor is complete and parity checks pass.
