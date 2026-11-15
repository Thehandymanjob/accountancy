# v263 support single-domain write correction — 2026-11-09

## Change
Updated `v263-support-controller.js` to remove both uses of the adapter's intentionally disabled `writeMany` operation.

- Language preference and preference metadata are now saved as separate single-domain writes.
- Each saved value is read back and compared with the requested value before success is returned.
- Report archive, report notifications, report settings, and report workflow are now saved sequentially as separate single-domain writes, each with read-after-write verification.
- The support controller no longer calls `writeMany`.

## Limitation
The four report workspace records are not an atomic multi-record transaction. If a later write fails, earlier records may already have been saved. The controller fails immediately and does not report overall success. This avoids violating the strict single-domain write boundary, but a future UI should surface partial completion clearly or consolidate the report workspace into one support-domain record before enabling the workflow.

## Scope and safety
- No Projects or Accounting data is accessed by this change.
- No LocalStorage migration or production data access occurs.
- Main application `index.html` was not modified.
- The application entry point remains v262 and does not load the v263 controllers; this commit is a component-level correction, not a live app release.

## Commit
`fe2ae7944aa8a6491964682e01aa23409694a538`
