# Backup v7 — Accounting-only implementation specification

Status: isolated module implemented on the existing test branch; not integrated into index.html and not tested against live app storage.

## Strict scope
- Accounting data: entries, customers, invoices, custom expense categories and accounting settings.
- Shared invoice/income sequence high-water mark.
- Accounting report archive, report settings, report workflow, report notifications and report email settings.
- Projects, Company, Contracts, business profile, help drafts, diagnostics and all unrelated keys are excluded.
- No excluded key is read, written, exported, restored or tested by this module.

## Export
1. Read and validate the Accounting JSON and report-setting allowlist.
2. Derive the shared sequence from the app baseline (142), remembered sequence and actual invoice/income numbers.
3. Create per-section SHA-256 digests and record counts.
4. Parse the serialized envelope and validate all digests/counts before initiating download.
5. Clearly distinguish download initiation from proof that the file was saved.

## Restore
1. Validate schema, required sections, settings, record counts and SHA-256 digests before confirmation.
2. Ask for explicit confirmation.
3. Refuse to overwrite an existing recovery snapshot.
4. Save and read-back-verify a pre-restore snapshot of only the allowlisted Accounting keys.
5. Restore Accounting and report settings; never lower the invoice/income high-water mark.
6. Read back and verify every target key.
7. On failure, roll back and verify all prior raw values. Retain the recovery snapshot if rollback cannot be verified.
8. Runtime app reload/refresh remains an integration responsibility and is not yet connected to index.html.

## Synthetic test requirements
- Valid Accounting export and validation.
- Tampered digest rejected.
- Cancelled restore leaves all target keys unchanged.
- Successful restore preserves the sequence high-water mark.
- Storage write failure rolls back all target keys.
- Invalid Accounting shape rejected before storage mutation.
- Existing recovery snapshot prevents restore.
- Projects, Company, Contracts, business profile and production data are not accessed.

## Release constraints
- Existing branch only: `test/v220-accounting-transfer-checkbox`.
- No new branches.
- Do not change `main`, production root deployment or `index.html`.
- Do not run tests against the user's real browser storage.
