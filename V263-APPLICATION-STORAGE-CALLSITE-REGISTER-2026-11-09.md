# THA v263 — Application Storage Call-Site Register

Date: 2026-11-09
Repository: Thehandymanjob/accountancy-test
Branch: main
Scope: read-only static scan of the current application entry point; no runtime execution and no data access.
Inspected entry point SHA: `27aa37e181f57e31fc5d8d3568d779ad99f5746e`

## Result

**CUTOVER REMAINS BLOCKED.** The app entry point is still v262. It loads only `storage-foundation.js` and `version-manager.js`, plus 11 inline script blocks. None of the v263 engine, adapter, or domain controllers is loaded.

The scan found **55 source lines** matching executable storage APIs, legacy foundation references, or Storage prototype instrumentation. This is a source-line count, not a count of individual API calls: one line can contain multiple operations, and a few matches are contextual references rather than standalone storage calls. There are zero SessionStorage matches. One Storage.prototype instrumentation line is present.

## Call-site groups

### Accounting and invoice lifecycle

| Line | Source excerpt |
|---:|---|
| 1112 | `function loadDB(){try{const raw=window.localStorage.getItem(KEY);if(raw!==null){let parsed;try{parsed=JSON.parse(raw)}catch(parseError){accountingDataIntegrityError=true;` |
| 1117 | `function persist(){try{if(!storageAvailable)throw new Error('Storage unavailable');const serialized=JSON.stringify(db);window.localStorage.setItem(KEY,serialized);const c` |
| 1118 | `if(window.HandymanStorageFoundation&&typeof window.HandymanStorageFoundation.writeAppState==='function'){` |
| 1120 | `thaAccountingIdbShadowQueue=thaAccountingIdbShadowQueue.then(()=>window.HandymanStorageFoundation.writeAppState('accounting',snapshot)).then(result=>{` |
| 1165 | `async function saveEntry(){const date=$('date').value,amount=Math.round(Number($('amount').value)*100)/100,type=$('type').value;let category=$('category').value.trim();co` |
| 1417 | `async function saveCustomer(){const name=$('customerName').value.trim();if(!name){alert('Please enter a customer or company name.');return}const id=$('customerEditId').va` |
| 1419 | `async function deleteCustomer(id){if(db.invoices.some(i=>i.customerId===id)){alert('This customer has invoices saved. Edit the customer instead of deleting it.');return}i` |
| 1425 | `function removeKnownIsolationTestRecord(){try{if(localStorage.getItem(ISOLATION_TEST_CLEANUP_KEY)==='1')return;const before=db.entries.length;db.entries=db.entries.filter` |
| 1427 | `function cleanupUncommittedInvoiceNumbers(){try{if(localStorage.getItem(INVOICE_SEQUENCE_CLEANUP_KEY)==='1')return;const persistedMax=Math.max(0,...db.invoices.map(i=>Num` |
| 1428 | `const EMPTY_TEST_SEQUENCE_RESET_KEY='tha_test226_empty_invoice_sequence_reset_v229';function resetStaleSequenceOnlyWhenNoSavedRecords(){try{if(localStorage.getItem(EMPTY_` |
| 1429 | `function highestSharedRecordNumber(){const invoiceNums=db.invoices.map(i=>Number(i.number)\\|\\|0);const incomeNums=db.entries.filter(e=>e.type==='income').map(e=>Number(e.nu` |
| 1430 | `function reserveRecordNumber(n){const num=Number(n)\\|\\|0;if(num<=0)return;try{const prior=Number(localStorage.getItem(INVOICE_SEQUENCE_KEY))\\|\\|0;if(num>prior){localStorage.s` |
| 1444 | `const raw=localStorage.getItem(KEY);` |
| 1516 | `const savedSnapshot=JSON.stringify(db);let idbVerified=false;try{if(window.__thaAccountingIdbShadowQueue)await window.__thaAccountingIdbShadowQueue;const storage=window.H` |
| 1753 | `loadDB();removeKnownIsolationTestRecord();cleanupUncommittedInvoiceNumbers();resetStaleSequenceOnlyWhenNoSavedRecords();assignNumbersToExistingIncome();const removedOrpha` |
| 1755 | `ensureInvoicePaymentFields();if(storageAvailable){try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}}` |
| 1756 | `ensureInvoiceFields();assignNumbersToExistingInvoices();if(storageAvailable){try{window.localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}} $('date').value=today();s` |

### Projects and project completion

| Line | Source excerpt |
|---:|---|
| 1226 | `let logo='';try{const savedWorkspace=JSON.parse(localStorage.getItem('tha_test226_projects_v1')\\|\\|'{}');const savedProfile=savedWorkspace.profile\\|\\|{};if(typeof savedProfil` |
| 1378 | `function syncLauncherBrand(){const title=document.getElementById('launcherName');if(title)title.textContent='The Handyman Accountancy';const img=document.getElementById('` |
| 1760 | `function prLoad(){try{const raw=localStorage.getItem(PR_KEY);let x={};if(raw!==null){try{x=JSON.parse(raw)}catch(parseError){projectsDataIntegrityError=true;console.warn(` |
| 1761 | `function prPersist(){try{if(projectsDataIntegrityError)throw Object.assign(new Error('Existing Projects data is in recovery mode; a valid backup must be restored before w` |
| 1824 | `function prSaveProject(){if(window.__thaProjectSaveInFlight)return;window.__thaProjectSaveOk=false;const projectStatus=document.getElementById('prProjectSaveStatus');if(p` |
| 2126 | `function prToggleProjectCompletion(){const p=prCurrent();if(!p)return;const oldStatus=p.status;p.status=p.status==='complete'?'open':'complete';try{localStorage.setItem(P` |
| 2130 | `function prBackup(){const blob=new Blob([JSON.stringify(prDB,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.do` |

### Contracts and profile

| Line | Source excerpt |
|---:|---|
| 2147 | `function ctRead(){let raw;try{raw=localStorage.getItem(CT_KEY)}catch(e){throw new Error('Contracts storage cannot be read. No contract changes were made.')}if(raw===null)` |
| 2148 | `function ctWrite(list){if(!Array.isArray(list)){alert('Contract save cancelled: invalid list. No data was changed.');return false}let previous=null;try{previous=localStor` |
| 2175 | `function ctProfile(){try{const p=JSON.parse(localStorage.getItem('tha_test226_projects_v1')\\|\\|'{}');const profile=p.profile\\|\\|{};return profile}catch(e){return {}}}` |

### Backup, restore and reset

| Line | Source excerpt |
|---:|---|
| 1384 | `const storage=window.HandymanStorageFoundation;` |
| 1401 | `function restore(e){const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{let oldDBRaw=null,oldProjects=null,oldContracts=n` |
| 1411 | `function factoryResetFinalConfirm(){if(factoryResetStage!==2\\|\\|$('factoryResetFinalButton').hidden\\|\\|$('factoryResetAcknowledgeBackup').hidden===false){alert('Complete both` |

### Monitoring, diagnostics and self-tests

| Line | Source excerpt |
|---:|---|
| 1191 | `function reportArchiveLanguage(){try{const lang=localStorage.getItem('tha_test226_app_language_v1')\\|\\|'en';return ['en','fa','ar','ckb','kmr','tr','pl'].includes(lang)?lan` |
| 2295 | `function monitorReadLog(){try{const a=JSON.parse(localStorage.getItem(MONITOR_LOG_KEY)\\|\\|'[]');return Array.isArray(a)?a:[]}catch(e){return []}}` |
| 2296 | `function monitorWriteLog(a){try{localStorage.setItem(MONITOR_LOG_KEY,JSON.stringify(a.slice(-MONITOR_MAX_EVENTS)));return true}catch(e){return false}}` |
| 2297 | `function monitorContext(){let projectVersion='';try{projectVersion=JSON.parse(localStorage.getItem('tha_test226_projects_v1')\\|\\|'{}').version\\|\\|''}catch(e){}return {appVers` |
| 2299 | `function installMonitorStorageHooks(){if(Storage.prototype.__handymanMonitorHooks)return;const originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.remo` |
| 2317 | `const api=window.HandymanStorageFoundation;` |
| 2332 | `function exportDiagnosticReport(){const logs=monitorReadLog(),ctx=monitorContext();let project={};try{project=JSON.parse(localStorage.getItem('tha_test226_projects_v1')\\|\\|` |
| 2334 | `window.runIndexedDBSelfTest=async function(){const el=document.getElementById('indexedDBSelfTestResult'),button=document.getElementById('runIndexedDBSelfTestButton');if(b` |
| 2341 | `const api=window.HandymanStorageFoundation;` |
| 2345 | `const raw=window.localStorage.getItem(KEY);` |
| 2369 | `const api=window.HandymanStorageFoundation;` |
| 2371 | `const raw=window.localStorage.getItem(KEY);` |
| 2389 | `function runMonitorSelfCheck(){const result=[];try{const log=monitorReadLog();result.push('Log storage: readable ('+log.length+' events)')}catch(e){result.push('Log stora` |
| 2399 | `const originalPersist=window.persist;if(typeof originalPersist==='function'&&!originalPersist.__monitorWrapped){const wrappedPersist=function(...args){let before=null;try` |
| 2413 | `const load=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)\\|\\|'null');return v===null?fallback:v}catch(e){return fallback}};` |
| 2415 | `try{localStorage.setItem(key,JSON.stringify(v));return true}` |

### Language preferences

| Line | Source excerpt |
|---:|---|
| 2942 | `const prefVersion=localStorage.getItem(APP_LANG_PREF_VERSION_KEY);` |
| 2944 | `localStorage.setItem(APP_LANG_KEY,'en');` |
| 2945 | `localStorage.setItem(APP_LANG_PREF_VERSION_KEY,'204');` |
| 2948 | `const saved=localStorage.getItem(APP_LANG_KEY)\\|\\|'en';` |
| 2973 | `try{localStorage.setItem(APP_LANG_KEY,lang);localStorage.setItem(APP_LANG_PREF_VERSION_KEY,'204')}catch(e){}` |

## Complete scan index

- Line 1112: `function loadDB(){try{const raw=window.localStorage.getItem(KEY);if(raw!==null){let parsed;try{parsed=JSON.parse(raw)}catch(parseError){accountingDataIntegrityError=true;`
- Line 1117: `function persist(){try{if(!storageAvailable)throw new Error('Storage unavailable');const serialized=JSON.stringify(db);window.localStorage.setItem(KEY,serialized);const c`
- Line 1118: `if(window.HandymanStorageFoundation&&typeof window.HandymanStorageFoundation.writeAppState==='function'){`
- Line 1120: `thaAccountingIdbShadowQueue=thaAccountingIdbShadowQueue.then(()=>window.HandymanStorageFoundation.writeAppState('accounting',snapshot)).then(result=>{`
- Line 1153: `function updateMainExpenseFields(category){const box=$('mainContractorField'),sel=$('mainContractorPicker'),ref=$('reference'),picker=$('categoryPickerButton');if(!box||!`
- Line 1165: `async function saveEntry(){const date=$('date').value,amount=Math.round(Number($('amount').value)*100)/100,type=$('type').value;let category=$('category').value.trim();co`
- Line 1191: `function reportArchiveLanguage(){try{const lang=localStorage.getItem('tha_test226_app_language_v1')||'en';return ['en','fa','ar','ckb','kmr','tr','pl'].includes(lang)?lan`
- Line 1226: `let logo='';try{const savedWorkspace=JSON.parse(localStorage.getItem('tha_test226_projects_v1')||'{}');const savedProfile=savedWorkspace.profile||{};if(typeof savedProfil`
- Line 1378: `function syncLauncherBrand(){const title=document.getElementById('launcherName');if(title)title.textContent='The Handyman Accountancy';const img=document.getElementById('`
- Line 1384: `const storage=window.HandymanStorageFoundation;`
- Line 1401: `function restore(e){const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{let oldDBRaw=null,oldProjects=null,oldContracts=n`
- Line 1411: `function factoryResetFinalConfirm(){if(factoryResetStage!==2||$('factoryResetFinalButton').hidden||$('factoryResetAcknowledgeBackup').hidden===false){alert('Complete both`
- Line 1417: `async function saveCustomer(){const name=$('customerName').value.trim();if(!name){alert('Please enter a customer or company name.');return}const id=$('customerEditId').va`
- Line 1419: `async function deleteCustomer(id){if(db.invoices.some(i=>i.customerId===id)){alert('This customer has invoices saved. Edit the customer instead of deleting it.');return}i`
- Line 1425: `function removeKnownIsolationTestRecord(){try{if(localStorage.getItem(ISOLATION_TEST_CLEANUP_KEY)==='1')return;const before=db.entries.length;db.entries=db.entries.filter`
- Line 1427: `function cleanupUncommittedInvoiceNumbers(){try{if(localStorage.getItem(INVOICE_SEQUENCE_CLEANUP_KEY)==='1')return;const persistedMax=Math.max(0,...db.invoices.map(i=>Num`
- Line 1428: `const EMPTY_TEST_SEQUENCE_RESET_KEY='tha_test226_empty_invoice_sequence_reset_v229';function resetStaleSequenceOnlyWhenNoSavedRecords(){try{if(localStorage.getItem(EMPTY_`
- Line 1429: `function highestSharedRecordNumber(){const invoiceNums=db.invoices.map(i=>Number(i.number)||0);const incomeNums=db.entries.filter(e=>e.type==='income').map(e=>Number(e.nu`
- Line 1430: `function reserveRecordNumber(n){const num=Number(n)||0;if(num<=0)return;try{const prior=Number(localStorage.getItem(INVOICE_SEQUENCE_KEY))||0;if(num>prior){localStorage.s`
- Line 1444: `const raw=localStorage.getItem(KEY);`
- Line 1516: `const savedSnapshot=JSON.stringify(db);let idbVerified=false;try{if(window.__thaAccountingIdbShadowQueue)await window.__thaAccountingIdbShadowQueue;const storage=window.H`
- Line 1701: `const storage=window.HandymanStorageFoundation;`
- Line 1725: `const storage=window.HandymanStorageFoundation;`
- Line 1753: `loadDB();removeKnownIsolationTestRecord();cleanupUncommittedInvoiceNumbers();resetStaleSequenceOnlyWhenNoSavedRecords();assignNumbersToExistingIncome();const removedOrpha`
- Line 1755: `ensureInvoicePaymentFields();if(storageAvailable){try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}}`
- Line 1756: `ensureInvoiceFields();assignNumbersToExistingInvoices();if(storageAvailable){try{window.localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}} $('date').value=today();s`
- Line 1760: `function prLoad(){try{const raw=localStorage.getItem(PR_KEY);let x={};if(raw!==null){try{x=JSON.parse(raw)}catch(parseError){projectsDataIntegrityError=true;console.warn(`
- Line 1761: `function prPersist(){try{if(projectsDataIntegrityError)throw Object.assign(new Error('Existing Projects data is in recovery mode; a valid backup must be restored before w`
- Line 1824: `function prSaveProject(){if(window.__thaProjectSaveInFlight)return;window.__thaProjectSaveOk=false;const projectStatus=document.getElementById('prProjectSaveStatus');if(p`
- Line 2126: `function prToggleProjectCompletion(){const p=prCurrent();if(!p)return;const oldStatus=p.status;p.status=p.status==='complete'?'open':'complete';try{localStorage.setItem(P`
- Line 2128: `function submitHelpContact(event){if(event)event.preventDefault();const name=($('helpContactName')?.value||'').trim(),email=($('helpContactEmail')?.value||'').trim(),subj`
- Line 2130: `function prBackup(){const blob=new Blob([JSON.stringify(prDB,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.do`
- Line 2147: `function ctRead(){let raw;try{raw=localStorage.getItem(CT_KEY)}catch(e){throw new Error('Contracts storage cannot be read. No contract changes were made.')}if(raw===null)`
- Line 2148: `function ctWrite(list){if(!Array.isArray(list)){alert('Contract save cancelled: invalid list. No data was changed.');return false}let previous=null;try{previous=localStor`
- Line 2175: `function ctProfile(){try{const p=JSON.parse(localStorage.getItem('tha_test226_projects_v1')||'{}');const profile=p.profile||{};return profile}catch(e){return {}}}`
- Line 2295: `function monitorReadLog(){try{const a=JSON.parse(localStorage.getItem(MONITOR_LOG_KEY)||'[]');return Array.isArray(a)?a:[]}catch(e){return []}}`
- Line 2296: `function monitorWriteLog(a){try{localStorage.setItem(MONITOR_LOG_KEY,JSON.stringify(a.slice(-MONITOR_MAX_EVENTS)));return true}catch(e){return false}}`
- Line 2297: `function monitorContext(){let projectVersion='';try{projectVersion=JSON.parse(localStorage.getItem('tha_test226_projects_v1')||'{}').version||''}catch(e){}return {appVers`
- Line 2299: `function installMonitorStorageHooks(){if(Storage.prototype.__handymanMonitorHooks)return;const originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.remo`
- Line 2317: `const api=window.HandymanStorageFoundation;`
- Line 2332: `function exportDiagnosticReport(){const logs=monitorReadLog(),ctx=monitorContext();let project={};try{project=JSON.parse(localStorage.getItem('tha_test226_projects_v1')||`
- Line 2334: `window.runIndexedDBSelfTest=async function(){const el=document.getElementById('indexedDBSelfTestResult'),button=document.getElementById('runIndexedDBSelfTestButton');if(b`
- Line 2341: `const api=window.HandymanStorageFoundation;`
- Line 2345: `const raw=window.localStorage.getItem(KEY);`
- Line 2369: `const api=window.HandymanStorageFoundation;`
- Line 2371: `const raw=window.localStorage.getItem(KEY);`
- Line 2389: `function runMonitorSelfCheck(){const result=[];try{const log=monitorReadLog();result.push('Log storage: readable ('+log.length+' events)')}catch(e){result.push('Log stora`
- Line 2399: `const originalPersist=window.persist;if(typeof originalPersist==='function'&&!originalPersist.__monitorWrapped){const wrappedPersist=function(...args){let before=null;try`
- Line 2413: `const load=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v===null?fallback:v}catch(e){return fallback}};`
- Line 2415: `try{localStorage.setItem(key,JSON.stringify(v));return true}`
- Line 2942: `const prefVersion=localStorage.getItem(APP_LANG_PREF_VERSION_KEY);`
- Line 2944: `localStorage.setItem(APP_LANG_KEY,'en');`
- Line 2945: `localStorage.setItem(APP_LANG_PREF_VERSION_KEY,'204');`
- Line 2948: `const saved=localStorage.getItem(APP_LANG_KEY)||'en';`
- Line 2973: `try{localStorage.setItem(APP_LANG_KEY,lang);localStorage.setItem(APP_LANG_PREF_VERSION_KEY,'204')}catch(e){}`

## Required implementation sequence

1. **Do not modify the v262 entry point.** It remains the rollback source.
2. Create a separate v263 app entry point and asynchronous startup barrier. It must fail closed if IndexedDB initialization or required domain validation fails; no legacy fallback.
3. Convert accounting CRUD, invoice CRUD/payment, and sequence allocation. Every mutation caller must await a committed IndexedDB operation before reporting success or updating dependent UI.
4. Convert Projects, sub-projects, Extra Job, all project ledgers/directories, completion/reopen, profile and all image/receipt media. Preserve unknown fields and stable IDs.
5. Convert Contracts, linked customer/project references, attachments, preview and PDF generation.
6. Replace backup, restore and factory reset as a single tested IndexedDB protocol, including binary files, validation, recovery lock and rollback.
7. Convert language/preferences, report archive/workflow, notifications and diagnostics. Remove Storage.prototype hooks and all legacy foundation dependency from the new runtime.
8. Run feature-level tests against the separate app entry point, then run a strict static scan of every shipped runtime script. Release gate: zero executable LocalStorage/SessionStorage calls, zero Storage.prototype patches, zero legacy foundation dependencies.

## Important distinction

The successful 11/11 LAB-3 result validates the isolated adapter/controllers and atomic transfer behaviors exercised by that lab. It does **not** validate the v262 application's UI event handlers or storage call sites. The app shell still uses LocalStorage as its authoritative store, so a production cutover is not approved.

## Safety

This register is read-only. No application code, production entry point, user data, LocalStorage, existing IndexedDB database, or backup was modified.
