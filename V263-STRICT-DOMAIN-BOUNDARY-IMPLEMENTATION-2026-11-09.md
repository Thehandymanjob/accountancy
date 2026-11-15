# THA v263 — Strict domain boundary implementation

Date: 2026-11-09
Branch: main
Commit: 3ce66460756c58b3ca00e87bc041e0828440c6f2

## Added
- `v263-strict-domain-boundary.js`
- Exposes named application scopes for Accounting, Projects, Contracts, Business Profile and support data.
- Every data operation is constrained to an explicitly allowed domain.
- Mutations are single-domain only; cross-domain batches are not exposed.
- Backup and restore require a package containing exactly one declared domain and reject mixed-domain records.
- Restore performs a post-restore content comparison.
- Projects scope contains only `projects`; Accounting scope allows accounting-owned records but backup currently requires a single domain package.

## Important limitation
This is a new safety boundary module. It is not yet loaded by `index.html`, and existing controllers still use the low-level adapter. Therefore this commit does not constitute application cutover or release readiness.

## Next required implementation
1. Route every controller through this boundary and remove direct low-level engine access from application-facing code.
2. Define Accounting backup composition for its own state and invoice sequence without including Projects.
3. Define Projects backup including all project records and embedded Blob/File media, without Accounting.
4. Convert the v262 UI call sites to awaited controller operations.
5. Keep root `index.html` unchanged until the complete UI path is converted.
