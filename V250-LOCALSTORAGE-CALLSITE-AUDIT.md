# THA v250 — LocalStorage Call-Site Audit

Audit date: 2026-11-07  
Source: `index.html` on `release239`  
Source blob SHA at audit: `f6bdb6a31fd9e424ca0464b5fb725c4ad0fb2315`  
Source length: 647,160 bytes; 2,899 lines  
Scope: static source inspection only; no browser execution and no data mutation.

## Summary

The source contains 47 lines matching LocalStorage / Storage-hook access patterns. This is a line count, not a count of individual method invocations. The main application still depends on synchronous LocalStorage operations. The v250 repository is asynchronous, so a safe migration requires async refactoring across the call graph.

## Call-site inventory

| Source line(s) | Area | Access / behavior | Migration concern |
|---|---|---|---|
| 1112–1113 | Accounting core | Read accounting JSON; write and read back serialized accounting DB | Must become awaited load/save; preserve integrity lock and read-back verification. |
| 1176 | Report language | Read app language | Must read preference domain; fallback semantics retained. |
| 1211, 1363, 2110, 2232, 2246 | Branding / report / diagnostics | Read project profile/logo/version | Avoid repeated synchronous reads; provide loaded profile state or async repository read. |
| 1367–1370 | Backup / restore | Export accounting; restore accounting, projects, contracts and recovery state | Backup must snapshot all domains consistently; restore must be atomic or have a rollback journal. |
| 1379 | Factory reset | Creates recovery snapshot before reset | Recovery snapshot must be committed and verified before any reset step. |
| 1393–1398 | Invoice maintenance | Remove isolation test record; cleanup sequence flags; reset stale sequence; compute and reserve invoice/income number | High risk: never auto-reset/reuse numbers. Use atomic counter reservation reconciled against all existing invoices and income entries. |
| 1412–1434 | Diagnostics | Read accounting LocalStorage and compare stored state | Rework diagnostics to inspect IndexedDB without treating absence in LocalStorage as data loss. |
| 1688–1691 | Startup normalization | Calls loadDB then cleanup/number assignment and writes accounting data during startup | Startup currently mutates persisted data. Must split validation from migration/repair and gate writes behind successful conversion and explicit versioned migration. |
| 1695–1696 | Projects core | Read and persist projects JSON | Must become async; preserve project recovery lock and read-back verification. |
| 1759 | Project save flow | Save handler and in-flight UI state | Await repository commit before showing success or releasing save lock. |
| 2061 | Project completion | Directly writes project status | Must use the same project persistence transaction; currently bypasses prPersist. |
| 2063 | Help contact | Contact submission workflow | Inspect adjacent helper implementation for drafts and remote submission; draft persistence is a separate data group. |
| 2065 | Project backup / restore | Project-only export/import | Must coordinate with global backup format and avoid partial cross-domain restore. |
| 2082–2083 | Contracts core | Read/write contracts array with validation and read-back | Async read/write; preserve IDs and protect malformed existing data. |
| 2230–2232 | Monitor | Read/write monitor log and project context | Keep diagnostic events separate from business data; preserve event order and timestamps. |
| 2234 | Monitor instrumentation | Wraps Storage.prototype setItem/removeItem and filters selected keys | Must not instrument IndexedDB as if it were LocalStorage; decide whether hooks are removed or redesigned for repository operations. |
| 2248 | IndexedDB self-test UI | Calls `HandymanStorageFoundation.selfTest()` | This points to the older test226 foundation, not the v250 repository. Must be corrected only as part of deliberate diagnostics migration. |
| 2249 | Monitor self-check | Writes, reads and removes a temporary LocalStorage key | Replace with a disposable namespaced IndexedDB self-test that cannot touch user records. |
| 2259 | Monitor wrapper | Wraps accounting persist and compares before/after LocalStorage values | Rework around async repository results; don't report success until transaction commit. |
| 2273, 2275 | Report storage helper | Generic synchronous JSON load/save by dynamic key | Enumerate every caller and map each dynamic key to a domain/key pair; do not leave a generic LocalStorage fallback active after cutover. |
| 2802, 2804–2805, 2808, 2833 | Language preferences | Reads preference version/language and may reset language to English; writes language and version | Migrate both keys together and preserve current compatibility behavior without overwriting a valid migrated preference on startup. |

## Key constants / dynamic key families observed

The source audit and previous key review identified these known keys or key families. Presence must be checked against the actual staged inventory; source-code references do not prove a key currently exists in the user's browser.

- Accounting: `tha_test226_accounting_v1`
- Projects: `tha_test226_projects_v1`
- Contracts: `tha_test226_contracts_v1`
- Invoice sequence: `tha_test226_invoice_sequence_v1`
- Isolation-test cleanup: `tha_test226_isolation_test_record_cleanup_v1`
- Invoice sequence cleanup: `tha_test226_invoice_sequence_cleanup_v1`
- Empty-sequence reset marker: `tha_test226_empty_invoice_sequence_reset_v229`
- Factory reset recovery: `tha_test226_factory_reset_recovery_v1`
- Monitor log: `tha_test226_monitor_log_v1`
- Report archive: `tha_test226_report_archive_v1`
- Report notifications: `tha_test226_report_notifications_v1`
- Report settings: `tha_test226_report_settings_v1`
- Report workflow: `tha_test226_report_workflow_v1`
- Report email settings: `tha_test226_report_email_settings_v1`
- Help contact drafts: `tha_test226_help_contact_drafts_v1`
- Language: `tha_test226_app_language_v1`
- Language preference version: `tha_test226_app_language_pref_version_v1`

There are also dynamic keys and older namespaces in the 40-key staged capture. Do not infer that older namespace data is obsolete, and do not merge it into current business records based only on key names.

## Specific risks discovered

1. **Startup writes:** the app performs cleanup, numbering and normalization immediately after loading accounting data (lines 1688–1691). A migration must not let legacy startup routines mutate LocalStorage or overwrite newly converted records before parity checks.
2. **Invoice sequence:** the sequence is shared by invoices and income entries. Counter reservation must be atomic with any corresponding record creation and must preserve the maximum historical number.
3. **Split persistence paths:** project completion writes directly to LocalStorage instead of using the main project persistence function.
4. **Multiple backup surfaces:** accounting backup, project backup, restore and factory reset recovery are separate flows. They need one documented, consistent backup/recovery model covering all domains and metadata.
5. **Instrumentation:** Storage.prototype hooks and the self-check are LocalStorage-specific. A naïve compatibility shim could produce false success/failure signals.
6. **Language reset:** startup preference-version logic can reset a language value. The version marker and language value must be migrated and handled together.
7. **Old diagnostics adapter:** the current IndexedDB self-test UI calls `HandymanStorageFoundation`, which belongs to the older test226 database. It must not be treated as a v250 health/self-test.

## Safe next engineering step

Build a **read-only v250 conversion planner** that:
- reads the 40 staged records from `legacy`;
- classifies only exact known source keys;
- validates JSON and each known schema without writing typed domains;
- reports unknown keys, invalid values, duplicate IDs and invoice-number reconciliation;
- emits a deterministic conversion manifest for review.

Only after the user confirms the exported v250 legacy snapshot should any typed conversion write be enabled. Keep `index.html` unchanged until the async refactor and parity plan are ready.

## Explicit non-actions

- No LocalStorage key was changed or deleted.
- No typed business-domain record was written by this audit.
- No app cutover was performed.
- `index.html` was not changed.
- Production `main` was not changed.
- No new branch was created.
