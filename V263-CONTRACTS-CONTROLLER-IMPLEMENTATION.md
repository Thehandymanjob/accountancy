# THA v263 — Contracts controller implementation note

Status: controller and isolated Safari test created; user execution pending.

## Added
- `v263-contracts-controller.js` — asynchronous IndexedDB-only controller for the existing `contracts` domain.
- `v263-contracts-controller-test.html` — isolated CRUD, quotation, validation, Blob attachment, and full-domain snapshot restoration test.

## Existing record compatibility
The current v262 contract editor stores a `contracts` array. Records include stable string `id`, `documentType` (contract or quotation), `title`, `date`, `customer`, `contact`, `address`, `price`, `start`, `body`, and `updated`. The controller preserves additional unknown fields, including imported/review metadata and structured-clone values.

## Safety
- Uses only the v263 IndexedDB adapter.
- No LocalStorage/SessionStorage access, migration, fallback, or cleanup.
- Refuses malformed contract state and duplicate IDs.
- Updates are atomic through the adapter mutation API.
- Test refuses to write unless Contracts is empty; it snapshots and restores all application domains and compares the restored snapshot.

## Not yet done
- Contract UI and print/PDF handlers are not wired to this controller.
- Main application remains on the v262 baseline; no cutover has occurred.
- Logo/profile integration, invoice/project linking, and backup/restore UI integration remain unconverted.

## Test
Open `https://thehandymanjob.github.io/accountancy-test/v263-contracts-controller-test.html` in Safari and tap **Run Contracts test**.
