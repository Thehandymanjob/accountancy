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
