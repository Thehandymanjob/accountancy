# THA v263 — Adapter cutover to strict domain boundary

Date: 2026-11-09
Branch: main

## Changes committed
- `app-storage-v263.js` now requires `HandymanV263DomainBoundary` for application data reads, writes and mutations.
- `writeMany()` now rejects all multi-domain writes.
- Projects and Contracts operations are restricted to their own domain scopes.
- Accounting state and invoice sequence have separate backup/restore scopes.
- Support records are accessed one logical domain at a time.
- Each ordinary write is read back and compared before success is returned.
- `readAll()` is now a sequence of independent reads, not a multi-domain transaction.

## Commits
- Strict boundary: `3ce66460756c58b3ca00e87bc041e0828440c6f2`
- Separate accounting backup identities: `84109d4bf7c11632e257dd4c6faf3f2f966b027d`
- Adapter routed through boundary: `ca92a4b8b6e7939954a1dc886eb33442b6aea4a4`
- Separate Accounting and invoice-sequence backup scopes: `a5d41d786a03dcad3b0bc79eb72810eabcc5a03d`

## Safety scope
These changes affect only the test repository modules. The v262 root application and its storage were not changed.

## Remaining release blockers
- The current UI entry point remains v262 and does not load these modules.
- Existing controllers are not yet wired into the real UI event handlers.
- The current recovery module still expects a whole-database backup and must be replaced by domain-specific backup/restore UI.
- Project media, receipts, logo and contract attachments need end-to-end UI conversion and verification.
- The accounting controller and invoice-number workflow need a single-domain backup contract that includes the sequence as a separately declared file, not a combined domain package.
- No app cutover or data migration has been performed.
