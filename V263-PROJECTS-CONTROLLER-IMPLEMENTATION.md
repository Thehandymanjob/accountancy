# THA v263 — Projects controller implementation note

Status: Projects controller created; isolated Safari test pending.

## Added
- `v263-projects-controller.js` — asynchronous IndexedDB-only controller for the existing Projects state shape.
- `v263-projects-controller-test.html` — isolated test for project/sub-project CRUD, directory records, ledger records, Blob media round-trip and full-domain snapshot restoration.

## Behavior
- Preserves unknown project fields and the current nested object model.
- Validates stable project and sub-project IDs.
- Supports project/sub-project records, workers, partners, contractors, companies, company jobs, and the existing project ledger collections.
- Uses IndexedDB structured cloning for Blob/File media; no JSON serialization of project state.
- No LocalStorage reads, writes, imports, fallback, or cleanup.
- Test stops before writes if the Projects domain is not empty and restores the full application-domain snapshot after test operations.

## Not yet done
- Main application is not wired to this controller.
- Project UI event handlers, image input pipeline, project/accounting synchronization, company contract workflows, backup/restore UI and P&L have not been converted.
- v262 `index.html`, `version.json`, and `service-worker.js` remain untouched.

## Test
Open `https://thehandymanjob.github.io/accountancy-test/v263-projects-controller-test.html` in Safari and tap **Run Projects test**.
