# Main Release History

## Authoritative Main Application — R11 (2026-11-15)

**Status:** Authoritative main application / primary data-bearing release  
**Version:** 273  
**Build ID:** `THA-273-INCOME-PREFIX-REPAIR-20261114-R11`  
**Canonical application URL:**  
`https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R11-icon-fix`

**Source file:** `v273-isolated-test/r11-income-prefix-repair-20261114/index.html`  
**Git blob SHA at registration:** `57d80aabb013dcf38162bae7a4107d1f374c58e5`

### Data authority and preservation

- This R11 URL is designated by the owner as the **main, authoritative application**.
- All records already entered and stored through this application are important and must be treated as authoritative user data.
- Do not replace this application, overwrite its data-bearing files, reset its IndexedDB database, clear its browser storage, migrate its records, or import another backup unless the owner gives explicit, separate approval.
- Future code changes must be developed and verified against a protected copy/branch first. Preserve the existing R11 data and storage identity.
- The root `/` application and other version folders must not be assumed to be the authoritative data-bearing application merely because they are on the `main` branch.

### Release note

This entry records the owner's explicit designation of the R11 application URL as the main application and its existing records as the authoritative records. It does not itself modify the application code or database.


## R11 Immutable Income Record Numbering Repair (2026-11-15)

**Status:** Code update committed to the owner's authoritative R11 application path; browser verification pending  
**Application version:** 273  
**Build ID:** `THA-273-R11-RECORD-NUMBERS-IMMUTABLE-20261115-MAIN-R4`  
**Canonical application URL:**  
`https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=MAIN-R4-20261115`

**Source file:** `v273-isolated-test/r11-income-prefix-repair-20261114/index.html`  
**Commit:** `6a0fc0790a09d35181d5a4e67f2b389a967ad74a`  
**Content blob SHA:** `d51949783ad676bf0c417d34943689ff0dffb014`

### Changes transferred from isolated R11 Preview R3

- Startup historical-number repair is now a no-op; existing income record numbers are not backfilled, prefixed, or renumbered.
- Invoice save preserves the number value of an already-linked income record, including blank or undefined values. A new number is allocated only when no linked income record exists.
- Mark-as-paid matching includes invoice ID, invoice reference, and generated income ID. The fallback that assigned a new number to an existing duplicate income record has been removed.

### Storage and data protection

- Main IndexedDB identity remains `the_handyman_accountancy_v273_clean_idb`.
- Main reset helper and storage engine were not changed.
- No IndexedDB records were read-modified-written, reset, migrated, or imported by this code commit.
- Only the R11 HTML application file was changed for the repair.
- Runtime verification in Safari against the main application remains pending; this entry does not claim browser-test completion.

## R11 Safari Diagnostics Extension (2026-11-15)

**Status:** Code update committed to the owner's authoritative R11 application path; browser verification pending  
**Application version:** 273  
**Build ID:** `THA-273-R11-SAFARI-DIAGNOSTICS-20261115-MAIN-R5`  
**Canonical application URL:**  
`https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=MAIN-R5-20261115`

**Source file:** `v273-isolated-test/r11-income-prefix-repair-20261114/index.html`  
**Commit:** `b5055a3f9617d33b35b43dcbc4a7e9001b873c79`  
**Content blob SHA:** `54a35eee1c183a9e48247cf717cbc6295a5189f5`

### Changes
- Added the build ID to diagnostic event context and the monitor context snapshot.
- Added capture of failed external script/resource loads, including URL and element type.
- Added Content Security Policy violation diagnostics.
- Added anonymous CORS mode to all eight dynamically created script loaders.
- Preserved the existing R11 immutable historical income/expense numbering safeguards and invoice-linking behavior.

### Data and verification boundary
- Only the authoritative R11 HTML file was changed; the existing R11 IndexedDB identity and data paths were not modified.
- No data reset, migration, import, or record rewrite was performed.
- The code and GitHub commit were checked after writing. Runtime verification in iPhone Safari remains pending; this entry does not claim browser-test completion.


## R11 Production R8 — Safari-approved Financial Report PDF workflow (2026-11-17)

**Status:** Production R8 merged and Pages deployment PASS; live Production Safari verification pending. User approved promotion after confirming Preview R31 on iPhone Safari.

- **Production Build ID:** `THA-273-R11-MAIN-20261117-R8`
- **Canonical URL:** `https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R8`
- **Source baseline:** Production R7, commit `b35090aab5463bf62683184c313eb5c2d9f50bed`.
- **Validated Preview source:** R31, Preview PR #75, merge `87a0f3dec1783d8002c342f5021954b747ac8952`.
- **Promoted functionality:** Financial Report Print Preview; vertical A4 layout; complete multi-page PDF; responsive PDF.js preview; iOS native Print handoff; final A4 centering using 185mm capture, zero horizontal PDF margins and 8mm vertical margins; only Back and Print on the final preview screen.
- **User verification:** PASS in Preview R31 on iPhone Safari. User confirmed equal left/right margins and full visibility of all amounts and table edges.
- **Production safeguards:** Preserve IndexedDB `the_handyman_accountancy_v273_clean_idb`, storage engine and user records. No schema, record, LocalStorage, migration, reset, restore, import or backup changes.
- **Excluded:** Preview red TEST VERSION banner and timestamp; Preview database identity; unverified standalone invoice PDF R29 centering; unrelated Preview-only changes.
- **Production PR:** #5 — https://github.com/Thehandymanjob/accountancy/pull/5.
- **Production merge:** `92eee8b755f0023b5e863e419a3b57e6856c22d4`.
- **Production Version Authority Gate:** PASS — run `44182393517`.
- **Production GitHub Pages:** PASS — run `44182393290`.
- **Production iPhone Safari:** Awaiting first live test; Preview PASS is not a claim of Production runtime verification.


## Production R9 — Full Project Report PDF pagination (2026-11-24)

- **Build ID:** `THA-273-R11-MAIN-20261124-R9`
- **Canonical URL:** https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R9
- **Validated Preview source:** R34, PR #81, merge `671f2fe82c17b3dc53591920db60d78b9e38dafe`.
- **Promoted functionality:** Keep Full Project Report section headings with summaries and following tables; avoid splitting rows; repeat table headers where supported; allow long tables to continue across A4 pages.
- **User verification:** PASS in Preview R34; user explicitly requested Production promotion.
- **Production safeguards:** Production IndexedDB name, storage engine, records and all user data remain unchanged. No schema, migration, reset, restore, import or backup changes.
- **Production Version Authority Gate:** PASS — run `45494118275`.
- **Production Pages deployment:** PASS — run [45501560078](https://github.com/Thehandymanjob/accountancy/actions/runs/45501560078).
- **Production iPhone Safari:** Pending live R9 verification.


## Production R10 — Automatic Last Updated from HTTP metadata (2026-11-24)

- **Build ID:** \`THA-273-R11-MAIN-20261124-R10\`
- **Canonical URL:** https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R10
- **Validated Preview source:** R37, merge \`d1c86520750040d6ff1589dfefc6f24e6be99dc8\`.
- **Promoted functionality:** Read the deployed page's same-origin HTTP \`Last-Modified\` header. The home page, Version Details and copied version details use the same formatted timestamp. If the header is absent, invalid or unavailable, show **در دسترس نیست** instead of a stale date.
- **Preview evidence:** Version Authority Gate PASS — run 45499791809; Preview Pages deployment PASS — run 45499791503.
- **Production safeguards:** Production IndexedDB identity, storage engine, schema and user data remain unchanged. No database, financial record or backup operations are performed.
- **Production Version Authority Gate:** PASS — run [45501561297](https://github.com/Thehandymanjob/accountancy/actions/runs/45501561297).
- **Production Pages deployment:** Pending.
- **Production iPhone Safari:** Pending live R10 verification.

## Production R11 — Preview parity correction (2026-11-24)

- **Build ID:** THA-273-R11-MAIN-20261124-R11
- **Canonical URL:** https://thehandymanjob.github.io/accountancy/v273-isolated-test/r11-income-prefix-repair-20261114/?build=R11
- **Source baseline:** Production R10, with only two validated Preview R37 behavior corrections ported: Settings Back returns to the main launcher (not the Accountancy home panel), and opening Monitor resets the document scroll position to the top.
- **Preserved:** Production R10 Last-Modified timestamp service; R34 Full Project Report pagination; financial report PDF workflow; Production runtime asset pins and Production IndexedDB identity. No Preview banner or Preview DB identity copied.
- **Data protection:** Only the Production R11 HTML app file and its release authority/history documentation are changed. No database, IndexedDB records, schema, storage engine, reset, restore, import, migration, backup or user records are touched.
- **Status:** Candidate prepared on the existing promotion branch. Version Authority Gate, PR review and Pages deployment pending. No Production deployment or Safari verification is claimed.
