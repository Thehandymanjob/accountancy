# V263 Business Profile — Independent Identity Domain
Date: 2026-11-09
Branch: main
Status: isolated implementation and user-run browser verification pending.

## Approved design
The existing Settings → Profile & Logo screen remains the sole user-facing editor and source of business identity. Do not create a second profile screen or duplicate profile records.

For the IndexedDB architecture, the profile is an independent neutral domain named `business_profile`, record key `identity`. It is separate from Projects, Accounting and Contracts. It contains the existing business identity fields:
- businessName
- ownerName
- phone
- email
- address (when present)
- logo
- paymentDetails
- unknown future/legacy fields are preserved.

Contracts, invoices, reports, launcher branding and other document renderers must read this same profile source. They must not read Projects to obtain logo or business contact details. Projects and Accounting remain mutually independent; both may read the neutral profile domain without creating a Projects↔Accounting relationship.

## Existing v262 source finding
The current Profile & Logo UI saves these fields under `prDB.profile` inside LocalStorage key `tha_test226_projects_v1`. Contract PDF generation calls `ctProfile()`, which reads that Projects key. Launcher branding also reads the same key. This is the dependency to remove during the later UI cutover.

The current profile form also contains invoice payment/bank details. Preserve that field with the rest of the profile; do not silently move it into Accounting or duplicate it in invoice settings.

## Isolated implementation added
- `storage-idb-v263-business-profile-engine.js`: dedicated database `tha_v263_business_profile_lab_20261109_idb`.
- `app-storage-v263-business-profile-lab.js`: exposes only the Business Profile domain; rejects all other domain reads/writes.
- `v263-business-profile-controller.js`: load/save/update, explicit import of a supplied legacy profile object, profile-only backup/restore, full read-back verification.
- `v263-business-profile-lab.html`: browser test page using synthetic data only.

The lab does not read LocalStorage, does not inspect the live Projects profile, does not access production, and does not migrate any user data. The import function requires the caller to pass the profile object explicitly; this lab never retrieves it from Projects.

## Browser test required
Run:
https://thehandymanjob.github.io/accountancy-test/v263-business-profile-lab.html

Expected result is 11/11 checks, but no result is claimed until the user sends the generated JSON report. If any check fails, stop and inspect the report before proceeding.

## Cutover requirements (not yet done)
1. Update the existing Profile & Logo UI to use this controller asynchronously while keeping the same screen and fields.
2. During migration, copy the existing `prDB.profile` object into `business_profile/identity` only after a read-only source validation and a verified backup; do not delete the original field in the same operation.
3. Switch contract PDF, invoice PDF, launcher branding, reports and every other branding callsite to read the one profile source.
4. Remove runtime reads of `tha_test226_projects_v1.profile` outside Projects.
5. Add separate profile backup/restore and include the profile in a documented user-data backup strategy without coupling Projects and Accounting.
6. Verify logo bytes/data URI, all text fields, unknown fields, old backups, restore, and iPhone Safari print/PDF output.
7. Do not change `index.html`, production repository, or live user data until the user explicitly approves cutover.

## Scope guard
This is an isolated lab implementation only. It does not mean the current app has migrated: v262 remains LocalStorage-authoritative and the current UI still reads the legacy profile location.
