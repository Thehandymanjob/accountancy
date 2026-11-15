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
