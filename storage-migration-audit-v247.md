# IndexedDB Migration Implementation Audit — App v247

Date: 2026-11-04
Repository: Thehandymanjob/accountancy-test
Branch: release239
Scope: static audit only; no application code or browser data changed.

## Confirmed storage boundaries

- App version in this branch: 247.
- Accounting LocalStorage key: tha_test226_accounting_v1.
- Projects LocalStorage key: tha_test226_projects_v1.
- Contracts LocalStorage key: tha_test226_contracts_v1.
- IndexedDB test database: the_handyman_accountancy_test226.
- Current deployed test Foundation on main: schema v4.
- release239 Foundation: schema v2. Do not load the release239 v2 Foundation over the populated v4 test database.
- Production database and production LocalStorage are outside this audit.

## Existing app storage entry points

| Domain | Read path | Write path | Current behaviour |
|---|---|---|---|
| Accounting | loadDB() | persist() | Synchronous JSON LocalStorage |
| Projects | prLoad() | prPersist() | Synchronous JSON LocalStorage; prLoad also migrates legacy materials to expenses |
| Contracts | ctRead() | ctWrite(list) | Synchronous JSON LocalStorage with rollback attempt |

Static call-site counts in release239/index.html:
- localStorage.getItem: 54
- localStorage.setItem: 26
- localStorage.removeItem: 11
- persist() references: 18
- prPersist() references: 30
- ctRead() references: 6
- ctWrite() references: 3

These counts include diagnostics, backup/restore, invoice sequencing, startup cleanup, monitoring and other settings in addition to the three main data domains.

## Critical compatibility finding

The app's persistence functions are synchronous. IndexedDB operations are asynchronous and transaction-scoped. A synchronous drop-in replacement would be unsafe: UI code could continue before reads complete, and existing boolean save-result handling would no longer represent transaction completion.

The app must therefore be refactored around an explicit asynchronous initialization barrier and awaited persistence operations. The refactor must not be implemented as a global monkey-patch of localStorage.

## Required migration sequence

1. Keep LocalStorage as the active source of truth during the transition.
2. Add an async IndexedDB repository with explicit methods for reading/writing each domain.
3. At startup, await a read-only reconstruction of accounting, projects and contracts from IndexedDB; compare exact objects and IDs against the selected backup before exposing edit controls.
4. Refactor accounting first: async load, then every persist caller must await commit success before refreshing UI or reporting success.
5. Refactor projects next. Preserve prLoad's legacy materials-to-expenses conversion semantics, but run conversion on a cloned object and commit only after validation. Never generate substitute IDs silently.
6. Refactor contracts after the first two domains are stable.
7. Move invoice sequence, monitoring, language, report settings and recovery keys only after their own key-by-key migration plan and tests.
8. Keep LocalStorage values and backup untouched throughout the parallel test period.
9. Test create/edit/delete/reload for each domain, plus relationship, date, ordering and image-byte checks.
10. Only after all tests pass should a separate, explicit cutover decision be considered. No automatic cutover or LocalStorage deletion.

## Hard blockers before application integration

- The current deployed Pages lab uses Foundation schema v4, while release239 contains schema v2. Align code only in an isolated test workflow; do not downgrade the populated v4 database.
- Current v247 app has synchronous persistence call sites across multiple domains. Each call chain must be updated to await completion.
- Backup/restore and factory-reset paths contain destructive LocalStorage operations. They must remain LocalStorage-only until their IndexedDB equivalents have independent recovery and rollback tests.
- The existing project loader performs a data transformation during load. That transformation must be preserved exactly and separately verified.

## Current evidence

The read-only app data-shape compatibility audit passed for the selected complete backup: record sets and fields match, and the original array order can be reconstructed using the order manifest. That proves data-shape compatibility only; it does not prove that the live application can safely read or write through IndexedDB.

## Safety status

- Production files changed: no.
- Production browser data accessed: no.
- LocalStorage changed by this audit: no.
- IndexedDB business records changed by this audit: no.
- App storage cutover: no.
