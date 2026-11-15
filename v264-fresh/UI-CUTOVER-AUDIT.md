# THA v264 UI cutover — source audit (2026-11-09)

## Scope and safety
- Target remains `v264-fresh/` only.
- Do not modify root `index.html`, `rollback/v262-index-20261109.html`, or `v263-candidate/index.html`.
- New database: `the_handyman_accountancy_v264_idb`.
- No LocalStorage/SessionStorage read, write, import, cleanup, or compatibility shim is permitted in the new app.
- The current v263 candidate is a frozen v262 UI source, not a clean v264 app.

## Confirmed source metrics
- Candidate: `v263-candidate/index.html`
- 663,103 bytes; 3,039 lines.
- 99 textual LocalStorage/SessionStorage references across 45 source lines.
- The references are executable dependencies, not just a single accounting save routine.
- Existing UI has multiple independently persisted data areas and synchronous read assumptions. IndexedDB operations are asynchronous, so replacing `localStorage.getItem/setItem` mechanically is unsafe.

## Persistence domains and conversion work

| Area | Existing persistence / coupling | Required v264 treatment |
|---|---|---|
| Accounting | `loadDB()`, `persist()`, boot-time cleanup and invoice-number normalization | Async bootstrap; accounting state and invoice sequence committed through v264 accounting APIs; remove all legacy cleanup routines |
| Projects | `prLoad()`, `prPersist()`, completion toggle, contractor picker, profile/logo reads | Async projects repository; explicit profile reads; no legacy workspace key |
| Contracts | `ctRead()`, `ctWrite()`, `ctProfile()` | Async contracts repository; binary attachments stored as Blob/File |
| Reports | Archive, report settings, notifications and workflow stored through generic key/value helpers | Convert each to its registered v264 support domain; await every save before success UI |
| Monitor | Monitor log and storage hooks inspect/intercept browser Storage prototype | Replace with IndexedDB diagnostics; remove Storage.prototype hooks and LocalStorage audit actions |
| Language | App language and preference-version keys | Use v264 preferences and preferenceMeta domains; async language bootstrap before first render |
| Business profile | Logo/business details are read from project workspace in legacy code | Use businessProfile domain; preserve logo binary as Blob |
| Backup / restore / reset | Legacy backup combines LocalStorage + multiple IndexedDB stores and contains legacy restore/cleanup assumptions | Replace with v264 portable backup API only; reset stays locked until end-to-end UI recovery is proven |

## Critical boot-time hazards
1. The old app calls `loadDB()` synchronously and immediately performs data cleanup and sequence normalization. This must not run against a fresh empty database.
2. Several functions mutate global in-memory objects and expect `persist()` to finish synchronously. They must be converted to awaited repository transactions; a synchronous facade would risk showing success before durable writes.
3. Project, contract and report features read other areas directly from LocalStorage. Those dependencies must become explicit async repository calls, not copied into a generic key-value shim.
4. The current contract and receipt UI contains image/data-URL paths. The v264 repository needs explicit binary conversion/persistence and tested preview/print rendering.
5. Current recovery lab verifies JSON, Blob, Date, integrity and tamper rejection in a synthetic isolated database. It does not yet prove large real-world photos/PDFs, iPhone Files download/reselection, or reset lock recovery in the production v264 database.

## Cutover sequence
1. Build async v264 boot coordinator: initialize engine, load every domain, verify database identity, then reveal UI.
2. Convert accounting CRUD and invoice sequence. Verify create/edit/delete/reload and no duplicate invoice-income linking.
3. Convert projects, subprojects, Extra Job, workers, partners, contractors, completion/reopen, and project P&L.
4. Convert contracts, profile/logo and all receipt/photo/document attachments.
5. Convert reports, notifications, language, preferences and diagnostics.
6. Replace backup/restore UI with the v264 portable recovery module; add file-picker inspection and restore verification. Keep Factory Reset disabled until a tested recovery route exists.
7. Remove all LocalStorage/SessionStorage code from the new entrypoint and run static scan plus iPhone Safari end-to-end tests.

## Release gate
Do not label the app usable or publish it as the working app until:
- static scan finds no LocalStorage/SessionStorage access in the v264 app runtime;
- all saves are awaited and read-back verified;
- all app modules initialize from the fresh DB without hidden fallback to old keys;
- Blob/File media survives reload and backup/restore;
- every critical workflow listed above passes on iPhone Safari;
- production root and v262 rollback remain unchanged.
