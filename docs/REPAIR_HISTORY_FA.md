# Repair History — The Handyman Accountancy Production

## PDF-LAYOUT-001 — Financial Report PDF layout and A4 print workflow

**Status:** Preview R31 user-verified; Production R8 merged and GitHub Pages deployment PASS. First live Production iPhone Safari verification is pending.

### Accepted repair — R31
- **Date:** 2026-11-17
- **Root issue:** The Accounting Financial Report PDF was not centred on A4; the right edge and amount values were clipped in iPhone Safari.
- **Rejected intermediate:** Preview R30 failed the user's Safari test; right-side values remained clipped. R30 is not an accepted repair.
- **Final repair:** Remove explicit horizontal PDF margins and centre a fixed 185mm capture root with `margin: 0 auto` on a 210mm A4 page. This yields 12.5mm equal whitespace on both sides. Vertical PDF margins remain 8mm.
- **Report layout:** A4 portrait; sections and rows stack vertically; amounts and detail labels remain visible; pagination preserves the complete multi-page report.
- **Preview interaction:** Yellow Print Preview generates and displays the PDF; final preview has only Back and Print. Print hands the complete original PDF to the iOS native share sheet so the user can select Print.
- **Preview source:** `Thehandymanjob/accountancy-r11-preview`, Build `THA-273-R11-PREVIEW-20261117-R31`, PR #75, merge `87a0f3dec1783d8002c342f5021954b747ac8952`.
- **Preview checks:** Version Authority Gate PASS (run `44178697278`); Preview Pages PASS (run `44178696828`).
- **User test:** PASS — user explicitly confirmed all requested PDF/report requirements on iPhone Safari, equal margins and complete table/amount visibility.

### Production R8 promotion
- **Target Build:** `THA-273-R11-MAIN-20261117-R8`.
- **Target URL:** `https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R8`.
- **Scope:** Port only the tested Accounting Financial Report PDF path and central Print Engine. Keep Production storage, database identity, records, reset code and unrelated app features unchanged.
- **Storage invariant:** Production IndexedDB remains `the_handyman_accountancy_v273_clean_idb`; storage engine SHA remains `ecba6aff372f4a47e02100a0a7d00db0c455d4b7`.
- **Not promoted:** Preview red test banner/time, Preview DB name, unrelated Preview changes, and standalone invoice PDF R29 centering (not user-verified in Safari).
- **Production PR:** #5 — https://github.com/Thehandymanjob/accountancy/pull/5
- **Production merge:** `92eee8b755f0023b5e863e419a3b57e6856c22d4`.
- **Production Version Authority Gate:** PASS — run `44182393517`.
- **Production GitHub Pages:** PASS — run `44182393290`.
- **Production iPhone Safari:** Awaiting first live test. Preview verification is not represented as Production verification.

### Release evidence
- Production change record: `THA-2026-11-17-PRODUCTION-PROMOTION-R8-PDF-001` in `VERSION-AUTHORITY.json`.
- Production PR, Gate, merge commit and Pages run recorded above; live Production Safari confirmation remains pending.


## Production R9 — PRJ-PDF-001 promotion (2026-11-24)

- **Issue:** Full Project Report PDF headings, summaries and tables were separating at page boundaries.
- **Accepted fix:** Promote the exact Preview R34 CSS pagination rules and html2pdf `pagebreak.avoid` selectors. Keep headings with their following summary/table; preserve table continuation and repeat headers where supported; avoid splitting individual rows.
- **Preview source:** R34, PR #81 — https://github.com/Thehandymanjob/accountancy-r11-preview/pull/81; merge `671f2fe82c17b3dc53591920db60d78b9e38dafe`.
- **User verification:** PASS — user confirmed the fix works in Preview before Production promotion.
- **Production target:** `THA-273-R11-MAIN-20261124-R9`; https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R9.
- **Production scope:** Full Project Report pagination only. No financial calculations, project records, accounting entries, IndexedDB, storage engine, or database contents changed.
- **Production Version Authority Gate:** PASS — run `45494118275`.
- **Production Pages deployment:** PASS — run [45501560078](https://github.com/Thehandymanjob/accountancy/actions/runs/45501560078).
- **Production Safari verification:** Pending live R9 check.


## Production R10 — Automatic Last Updated from HTTP metadata (2026-11-24)

- **Issue:** Version Details previously used GitHub Actions deployment-run metadata, which could leave a stale timestamp visible when fresh deployment metadata was unavailable.
- **Accepted mechanism:** Read the deployed Production page's same-origin HTTP \`Last-Modified\` response header using a no-cache HEAD request. Share one cached result across the home display, Version Details and Copy version details.
- **Fallback:** If the request fails, the header is absent, or the date is invalid, show **در دسترس نیست** in all three locations. Do not retain an old date.
- **Preview source:** R37 — merge \`d1c86520750040d6ff1589dfefc6f24e6be99dc8\`; Version Authority Gate and Pages deployment PASS.
- **Production target:** R10 — \`THA-273-R11-MAIN-20261124-R10\`.
- **Data protection:** No accounting/project records, IndexedDB, storage engine, schema, imports, resets, restores or backups are changed.
- **Production Version Authority Gate:** PASS — run [45501561297](https://github.com/Thehandymanjob/accountancy/actions/runs/45501561297).
- **Production Pages deployment:** Pending.
- **Production Safari verification:** Pending — awaiting the user's live iPhone Safari check.

## PRODUCTION-PARITY-001 — Production navigation and Monitor parity correction

**Status:** Candidate prepared; Version Authority Gate and Production deployment pending. Live iPhone Safari verification not performed.

### Diagnosis
- Production R10 was created by selectively porting the timestamp correction from Preview R37, not by carrying forward all applicable validated Preview navigation/monitor fixes.
- The Production ACCOUNTING_PARENT settings mapping pointed to accountancyHome; Preview R37 maps it to launcher. Therefore Settings Back did not follow the validated Preview behavior.
- Production's show('monitor') path called renderMonitor() without the Preview R37 scroll-to-top reset.
- The existing Production R10 Last-Modified timestamp service and Production PDF pagination CSS are retained; neither is rewritten in this correction.

### Candidate correction — R11
- **Build:** THA-273-R11-MAIN-20261124-R11.
- **URL:** https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R11
- Set ACCOUNTING_PARENT.settings to launcher.
- Restore the Preview R37 Monitor scroll reset using requestAnimationFrame, window.scrollTo(0,0), and document.scrollingElement fallback.
- Preserve Production-specific timestamp service, canonical repository identity, runtime dependencies, and Production storage identity.
- **Changed files:** Production R11 index, VERSION-AUTHORITY.json, MAIN-RELEASE-HISTORY.md, docs/REPAIR_HISTORY_FA.md, docs/REPAIR_INDEX_FA.md.
- **Data boundary:** No database or user data operation. No runtime dependency, schema, IndexedDB identity, storage engine, records, import, reset, restore, migration or backup changes.
- **Verification:** Source-level assertions passed for R11 Build ID, canonical URL, Settings parent, Monitor scroll reset, absence of Preview banner and absence of Preview DB identity. Version Authority Gate pending; no browser/Safari runtime test is claimed.


## PRODUCTION R12 — Expenses category groups and selection repair (2026-11-26)

- **Build ID:** `THA-273-R11-MAIN-20261126-R12`
- **Canonical URL:** https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R12
- **Preview source:** R38 four-group category picker and per-group Add New One flow (Preview PR #88), followed by R39 selected-category display repair (Preview PR #92).
- **Promoted behavior:** Four independent Expenses groups — Materials, Car Expenses, Tools and Others. Each group has its own Add New One screen; a newly added category is saved to that group, the list returns to the same group, and the new category is selected. Selecting an existing category such as Selco remains visible on the Category button and selected in the list.
- **Compatibility:** Existing expense category strings and `customExpenseCategories` are retained. Legacy custom categories are grouped where their prefix is known and otherwise remain under Others. The new `expenseCategoryLists` field is persisted through the existing Production Accounting IndexedDB gateway.
- **Data boundary:** No database identity, object-store schema, existing expense/income/invoice/project records, IDs, sequences, backup, import, restore, reset or migration is changed. No Preview database or Preview runtime assets are copied.
- **Changed files:** Production R12 index, Version Authority, release history and repair documentation only.
- **Production Version Authority Gate:** Pending PR checks.
- **Production Pages deployment:** Pending.
- **Production iPhone Safari verification:** Pending live R12 check.
