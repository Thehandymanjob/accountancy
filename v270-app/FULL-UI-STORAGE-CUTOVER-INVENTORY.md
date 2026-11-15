# Full UI Storage Cutover Inventory — refreshed 2026-11-10

## Active application surface

Candidate: `v264-app/index.html` (currently metadata version 262; not yet a released v264 build).

The preserved legacy UI is now wired to the v264 IndexedDB gateway for the principal business domains. The UI keeps in-memory objects such as `db`, `prDB`, and contract/report caches for rendering only; durable writes go through asynchronous controller/gateway calls.

## Active storage domains

| UI feature | IndexedDB domain(s) | Write behavior |
|---|---|---|
| Accounting entries, customers, invoices, categories and settings | `accounting` | `persist()` waits for gateway save and verified read-back; 12 call sites awaited |
| Invoice number high-water mark | `sequences` | Reserved through the accounting controller; reservation is awaited on startup and invoice operations |
| Projects, sub-projects, workers, partners, contractors, companies, jobs and project ledgers | `projects` | `prPersist()` waits for verified save; 31 call sites awaited; failed save restores last verified state |
| Business name, owner, phone, email, address, logo and payment details | `business_profile` | Separate domain; project/profile writes are coordinated and rollback is attempted if either side fails |
| Contracts | `contracts` | Async save, read-back and equality verification; both UI write call sites awaited |
| Application language | `preferences`, `preference_meta` | Support controller write queue |
| Monitor history | `diagnostics` | Async diagnostics queue |
| Report archive | `reports` | Async report write queue |
| Report notifications | `report_notifications` | Async report write queue |
| Report settings, including accountant recipient details | `report_settings` | Async report write queue |
| Reporting workflow | `report_workflow` | Async report write queue |
| Help/contact drafts | `help_contact_drafts` | Support controller write queue |
| Media assets | `media` | Dedicated controller/domain available; current legacy UI still stores its attachments within owning records |

Recovery domains additionally include `notifications`, `recovery`, and `factory_reset_recovery`.

## Storage API boundary

The candidate HTML and its 15 loaded external scripts were statically scanned:

- Direct LocalStorage API calls: 0
- Direct SessionStorage API calls: 0
- `Storage.prototype` instrumentation: 0
- `document.cookie` access: 0
- Legacy storage-foundation dependency: removed from the active page

Legacy-looking identifiers such as old key names may remain as logical IDs or labels; they are not used through browser Storage APIs in the active candidate.

## Write completion and rollback

- Accounting, project, contract and report writes are asynchronous and awaited by their UI call sites.
- Project persistence restores the last verified project snapshot after a failed write.
- Project and Business Profile saves are coordinated by the gateway; rollback writes and read-back checks are attempted on failure.
- Report notification/read-state and workflow changes are reverted in memory when their corresponding write fails.
- Help-contact drafts and language preference writes are serialized through the Support write queue.

## Backup coverage

The portable recovery module snapshots 17 domains and encodes Blob/File/binary data. The full backup/restore UI waits for all active write queues and a gateway read barrier before operating.

A separate project-only JSON export remains distinct from the full portable backup. The full portable backup is the authoritative route for complete application recovery, including media-domain records.

## Known functional gaps / verification work

- The candidate has no active Pay Contractor button and no explicit Transfer to Accounting action. Project completion changes status only. Do not infer that project data is transferred to accounting.
- Company Contracts & Jobs payment records remain in the Projects domain and are not automatically added to Accounting.
- The invoice payment modal records the full invoice amount; partial payment is not represented in the current UI.
- The dedicated media controller is loaded but not yet used by the preserved UI; verify all actual attachment fields through Safari backup/restore.
- iPhone Safari runtime tests and print/PDF visual regression tests remain outstanding.
- The app metadata still identifies version 262. Version 264 release metadata and updater configuration are deferred until the candidate passes testing.
