# V263 — Business Profile Consumer Audit
Date: 2026-11-09
Branch: main
Source audited: index.html at SHA 27aa37e181f57e31fc5d8d3568d779ad99f5746e
Test evidence: THA-263-BUSINESS-PROFILE-LAB-1, 11/11 passed (user-provided report).

## Result
The isolated Business Profile domain passed all 11 browser checks. This confirms the isolated controller and domain design only. The production-facing v262 entry point still stores the profile under the Projects LocalStorage object and has not been migrated.

## Current profile storage and consumers found in index.html

1. Profile editor and save:
   - `prLoadProfile()` reads `prDB.profile`.
   - `prSaveProfile()` writes `prDB.profile` and calls `prPersist()`.
   - The profile is currently persisted as part of `tha_test226_projects_v1`.
   - Fields include businessName, ownerName, phone, email, paymentDetails and logo; historical aliases bankDetails and bankAccountDetails are also read.

2. Main launcher logo:
   - `syncLauncherBrand()` reads `tha_test226_projects_v1.profile.logo`.
   - Called on startup and when returning to launcher.

3. Contract PDF:
   - `ctProfile()` reads `tha_test226_projects_v1.profile`.
   - `ctBuildPrint()` uses logo, businessName, ownerName, phone and email.
   - This is the direct Contracts → Projects profile dependency previously identified.

4. Invoice PDF:
   - Invoice renderer uses `prDB.profile.logo` and profile businessName as fallback.
   - It uses profile paymentDetails and legacy bankDetails/bankAccountDetails as fallback after Accounting settings.
   - This is another cross-domain profile read to remove. The profile itself must remain a neutral source; do not copy profile data into Projects or Accounting.

5. Accounting financial report PDF:
   - Report generation reads `tha_test226_projects_v1.profile.logo` directly.
   - It must be switched to the neutral Business Profile source.

6. Project receipt / project reports:
   - Project receipt and project report builders read `prDB.profile` for businessName and logo.
   - These should use the shared neutral Business Profile controller rather than relying on a profile embedded in the Projects data snapshot.
   - Project transaction data remains entirely within Projects.

7. Diagnostics:
   - `monitorContext()` reads Projects storage for the project workspace version; this is a Projects diagnostic and should remain Projects-only.
   - `exportDiagnosticReport()` reads the Projects object. Review whether it needs any profile fields; do not add Business Profile content to diagnostics unless strictly necessary.
   - Storage monitoring hooks observe writes to the Projects key; retain domain-specific diagnostics without creating cross-domain data access.

8. Backup, restore and reset:
   - Current v262 backup/restore/reset includes Projects profile as part of the Projects object and some legacy full-backup formats.
   - During migration, preserve backward compatibility with existing backups. Do not silently discard the embedded profile from old backups.
   - New profile backup/restore must be independent. The overall backup strategy must explicitly document how the neutral profile is included without joining Projects and Accounting into one domain or making them reference each other.
   - Factory reset must include the independent Business Profile store as its own reset scope, with safeguards and verified recovery.

## Required migration approach

A. Keep one user-facing Profile & Logo screen. Do not create a duplicate profile UI.

B. On startup/cutover, read and validate the legacy `prDB.profile` object from Projects only as a one-time migration source. Validate the source object, preserve all known fields and unknown fields, and write it into `business_profile/identity`. Read it back and compare the complete object before marking migration complete. Do not delete the legacy embedded profile in the same migration step.

C. The Profile & Logo screen must load/save through `HandymanBusinessProfileV263`. Its save must be verified before showing success. Keep existing logo image processing/size limits and iPhone-supported formats.

D. All consumers listed above must asynchronously read the neutral Business Profile controller:
   - launcher branding
   - contract PDF
   - invoice PDF and invoice payment details
   - accounting financial report PDF
   - project receipt PDF
   - project reports
   - any other branded print/export output found by a second scan.

E. Do not let Contracts read Projects for profile data. Do not let Accounting read Projects for profile data. Projects may use the neutral profile for print branding but must not store or mutate it as part of project transactions. Accounting may use the neutral profile for document branding/payment instructions but must not store or mutate it as part of accounting transactions.

F. Review and preserve compatibility for old backups that contain `projects.profile`. On restore, if a legacy backup contains a profile, import it into the independent profile only under a documented conflict policy. Never overwrite a newer profile silently. Report conflicts to the user and verify profile logo data after restore.

G. Do not change the production repository or current `index.html` until all consumer rewiring, backup/restore compatibility, iPhone PDF tests, and user approval are complete.

## Current status
- Isolated Business Profile domain: PASS, 11/11.
- Production v262 still LocalStorage-authoritative: unchanged.
- Profile editor still writes Projects LocalStorage: unchanged.
- Contract, invoice, report, launcher and project print consumers still use legacy profile paths: unchanged.
- Production cutover: NOT APPROVED / NOT PERFORMED.

## Follow-on implementation — shared consumer bridge
Added on 2026-11-09:
- `v263-business-profile-consumers.js`: read-only asynchronous bridge for launcher, contracts, invoices, accounting reports, project receipts, project reports and other exports. All seven consumer types read the same Business Profile controller. The bridge exposes no write, Projects, Accounting or legacy-storage API.
- `v263-business-profile-consumer-integration-lab.html`: isolated browser test page using synthetic profile data only.

The consumer integration lab is the next user-run verification gate. It does not yet rewrite the real v262 renderers or profile form. The current `index.html` remains unchanged and must not be described as integrated.

## Consumer bridge verification and migration safety hardening
- User-provided consumer integration report: PASS, 11/11 checks. Seven consumers read the same profile, profile updates are visible on next read, bridge is read-only, and only the `business_profile` domain is persisted.
- Updated `v263-business-profile-controller.js`: explicit legacy import is now safe against silent overwrite. On an empty profile store, the supplied legacy object is imported and verified. Repeating the identical import is idempotent. If a different profile already exists, import is rejected with a conflict error; it does not overwrite the current profile.
- Added an isolated migration safety lab with its own fresh database, separate adapter and synthetic-only profile: `v263-business-profile-migration-safety-lab.html`. It checks first import, repeat import, conflict rejection, preservation of current logo/data, profile-only backup/restore, mixed-domain rejection, invalid input rejection and database health.
- This safety gate is not yet user-run. The real v262 editor, backup/restore and document renderers remain unchanged; production cutover is still not approved.
