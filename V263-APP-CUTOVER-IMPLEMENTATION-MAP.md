# THA v263 — Application storage domain mapping

Status: design inventory only. No application storage call site has been converted by this document.

Source: `main/index.html`, v262 build, inspected after the v263 foundation Build 3 passed.

## IndexedDB domain mapping

| Existing v262 storage key / function | v263 IndexedDB domain | Target record key | Notes |
|---|---|---|---|
| `tha_test226_accounting_v1` / `KEY` | `accounting` | `state` | Full accounting state: entries, customers, invoices, settings, expense categories. Keep existing shape initially to reduce regression risk. |
| `tha_test226_projects_v1` / `PR_KEY` | `projects` | `state` | Projects, subprojects, receipts/media references, workers, partners, contractors, companies and profile. Binary images/logo should be Blob/File records or explicit binary records, not data URLs in a synchronous store. |
| `tha_test226_contracts_v1` / `CT_KEY` | `contracts` | `state` | Contract list with existing IDs and structure. |
| `tha_test226_invoice_sequence_v1` / `INVOICE_SEQUENCE_KEY` | `sequences` | `invoice-number` | Replace local increment logic with atomic `reserveCounter`; coordinate with invoice/accounting write so failed invoice creation does not silently reuse a number. |
| `tha_test226_app_language_v1` / `APP_LANG_KEY` | `preferences` | `language` | Validate supported language codes on read and write. |
| `tha_test226_app_language_pref_version_v1` / `APP_LANG_PREF_VERSION_KEY` | `preferences` | `language-pref-version` | Keep only if migration-free defaulting/version logic still requires it. |
| `tha_test226_monitor_log_v1` / `MONITOR_LOG_KEY` | `diagnostics` | `monitor-log` | Replace Storage.prototype instrumentation with explicit, bounded diagnostics writes. |
| `tha_test226_factory_reset_recovery_v1` | `recovery` | `last-reset-snapshot` | New reset snapshot must be generated from v263 IndexedDB domains only. Do not read or include v262 LocalStorage values. |
| `ISOLATION_TEST_CLEANUP_KEY`, `INVOICE_SEQUENCE_CLEANUP_KEY`, `EMPTY_TEST_SEQUENCE_RESET_KEY` | none | none | Historical test-cleanup markers are not needed in the fresh v263 database. Remove the old cleanup/normalization paths rather than porting them. |

## Additional storage surfaces requiring discovery and conversion

- Report archive and generated report state.
- Notification history and workflow state.
- Email settings and contact drafts.
- Any profile logo, project images, receipt images, attachments, and other Blob/File values.
- Any dynamic key/value helper introduced by the diagnostics or settings functions.
- Backup export/import, factory reset, and integrity/health reporting.

## Required implementation order

1. Build and test the repository/domain adapter against a clean v263 database; no legacy key reads.
2. Add an asynchronous bootstrap barrier: do not render/edit until IndexedDB is ready and all initial domain reads validate.
3. Convert accounting state and invoice sequence. Make every save path await and verify the IndexedDB write.
4. Convert projects, subprojects, profile and media.
5. Convert contracts, reports, preferences, diagnostics and remaining auxiliary state.
6. Rebuild backup/restore/reset around IndexedDB domains and binary values.
7. Remove `storage-foundation.js` from the app script chain after all callers are gone.
8. Scan every shipped runtime file for LocalStorage, SessionStorage and Storage.prototype references; require zero executable hits.
9. Run functional regression tests and Safari runtime instrumentation before release.

## Non-negotiable boundaries

- No v262 LocalStorage reads, imports, migrations, or fallback.
- No clearing/deleting old LocalStorage values during v263 setup or reset.
- No change to the v262 rollback source until v263 is fully verified and explicitly approved.
- The foundation's standalone PASS is not an application-cutover PASS.
