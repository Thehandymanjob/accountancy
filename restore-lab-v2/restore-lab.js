/* Isolated restore laboratory. No app Local Storage or production DB access. */
(() => {
'use strict';
const DB='tha_restore_lab_v1', STORE='backupRecords', ID='trusted-backup-reference';
const $=id=>document.getElementById(id);
function status(s,k='info'){$('status').textContent=s;$('status').dataset.kind=k}
function openDB(){return new Promise((ok,no)=>{if(!indexedDB)return no(Error('IndexedDB unavailable'));const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error||Error('Cannot open test DB'));r.onblocked=()=>no(Error('Test DB blocked by another tab'))})}
function validate(x){
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('JSON root must be an object');
 if(x.app!=='The Handyman Accountancy'||x.backupType!=='complete-user-data')throw Error('Not a complete The Handyman Accountancy backup');
 const d=x.data,p=x.projects;
 if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.entries)||!Array.isArray(d.customers)||!Array.isArray(d.invoices)||!d.settings||typeof d.settings!=='object'||Array.isArray(d.settings))throw Error('Accounting section incomplete');
 if(!p||typeof p!=='object'||Array.isArray(p)||!Array.isArray(p.projects)||!Array.isArray(p.workers)||!p.profile||typeof p.profile!=='object'||Array.isArray(p.profile))throw Error('Projects/profile section incomplete');
 if(!Array.isArray(x.contracts))throw Error('Contracts section must be an array');
 return {accountingEntries:d.entries.length,customers:d.customers.length,invoices:d.invoices.length,projects:p.projects.length,workers:p.workers.length,partners:Array.isArray(p.partners)?p.partners.length:0,contractors:Array.isArray(p.contractors)?p.contractors.length:0,companies:Array.isArray(p.companies)?p.companies.length:0,contracts:x.contracts.length,logoPresent:!!p.profile.logo,accountingBytes:new Blob([JSON.stringify(d)]).size,projectsBytes:new Blob([JSON.stringify(p)]).size,contractsBytes:new Blob([JSON.stringify(x.contracts)]).size}
}
async function hash(s){if(!crypto.subtle)throw Error('SHA-256 unavailable; use the GitHub Pages HTTPS address');const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function saveRead(db,rec){return new Promise((ok,no)=>{const t=db.transaction([STORE],'readwrite'),s=t.objectStore(STORE);let back;const p=s.put(rec);p.onsuccess=()=>{const g=s.get(ID);g.onsuccess=()=>back=g.result;g.onerror=()=>{try{t.abort()}catch(_){}no(g.error)}};p.onerror=()=>no(p.error);t.oncomplete=()=>ok(back);t.onerror=()=>no(t.error||Error('Write transaction failed'));t.onabort=()=>no(t.error||Error('Write transaction aborted'))})}
async function verify(){const db=await openDB();try{const rec=await new Promise((ok,no)=>{const t=db.transaction([STORE],'readonly'),r=t.objectStore(STORE).get(ID);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>no(r.error)});if(!rec){status('No backup imported into this test database yet.');return}const x=JSON.parse(rec.raw),counts=validate(x),h=await hash(rec.raw);if(h!==rec.sha256||new Blob([rec.raw]).size!==rec.bytes)throw Error('Stored hash or byte count mismatch');$('details').textContent=JSON.stringify({database:DB,savedAt:rec.savedAt,bytes:rec.bytes,sha256:h,...counts},null,2);status('PASS: stored record, JSON structure, byte count and SHA-256 all verified. App data was not accessed.','ok')}finally{db.close()}}
async function importFile(f){if(!f)return;$('importButton').disabled=true;status('Reading and validating backup…');try{const raw=await f.text(),x=JSON.parse(raw),counts=validate(x),h=await hash(raw),rec={id:ID,savedAt:new Date().toISOString(),sourceName:f.name,bytes:new Blob([raw]).size,sha256:h,raw};const db=await openDB();try{const back=await saveRead(db,rec);if(!back||back.raw!==raw||back.sha256!==h||back.bytes!==rec.bytes)throw Error('Read-back verification failed')}finally{db.close()}if(await hash(raw)!==h)throw Error('Post-write hash verification failed');$('details').textContent=JSON.stringify({database:DB,savedAt:rec.savedAt,sourceName:f.name,bytes:rec.bytes,sha256:h,...counts},null,2);status('PASS: backup stored and read back exactly in isolated IndexedDB. No app data was changed.','ok')}catch(e){status('TEST FAILED: '+(e.message||String(e))+' No production app data was accessed.','error')}finally{$('importButton').disabled=false;$('backupFile').value=''}}
$('importButton').addEventListener('click',()=>$('backupFile').click());
$('backupFile').addEventListener('change',e=>importFile(e.target.files&&e.target.files[0]));
$('verifyButton').addEventListener('click',()=>verify().catch(e=>status('VERIFY FAILED: '+e.message,'error')));
status('Ready. Separate test database only; the live app storage is untouched.');
})()

/* Compatibility checker is a separate closure so it can safely access only the lab DB. */
(() => {
'use strict';
const DB='tha_restore_lab_v1', STORE='backupRecords', ID='trusted-backup-reference';
const el=id=>document.getElementById(id);
const setStatus=(s,k='info')=>{el('status').textContent=s;el('status').dataset.kind=k};
function openLabDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Cannot open isolated test database'))})}
function getRecord(db){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(ID);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||Error('Cannot read saved test snapshot'))})}
async function sha256(s){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function dataUriBytes(v){if(typeof v!=='string'||!v.startsWith('data:')||!v.includes(','))return 0;const s=v.slice(v.indexOf(',')+1);return Math.max(0,Math.floor(s.length*3/4)-(s.endsWith('==')?2:s.endsWith('=')?1:0))}
function inspect(x){
 const issues=[],notes=[],d=x.data,p=x.projects;
 const requiredAccounting={entries:Array.isArray(d.entries),customers:Array.isArray(d.customers),invoices:Array.isArray(d.invoices),settings:!!d.settings&&typeof d.settings==='object'&&!Array.isArray(d.settings)};
 for(const [k,ok] of Object.entries(requiredAccounting))if(!ok)issues.push('Accounting.'+k+' fails v212 restore validation');
 const projectArrays={projects:Array.isArray(p.projects),workers:Array.isArray(p.workers)};
 for(const [k,ok] of Object.entries(projectArrays))if(!ok)issues.push('Projects.'+k+' must be an array');
 if(!p.profile||typeof p.profile!=='object'||Array.isArray(p.profile))issues.push('Projects.profile must be an object');
 const summary={accounting:{entries:d.entries.length,customers:d.customers.length,invoices:d.invoices.length,customExpenseCategories:Array.isArray(d.customExpenseCategories)?d.customExpenseCategories.length:null,thirdPartyTransactions:Array.isArray(d.thirdPartyTransactions)?d.thirdPartyTransactions.length:null,settingsKeys:Object.keys(d.settings||{})},projects:{projects:Array.isArray(p.projects)?p.projects.length:null,workers:Array.isArray(p.workers)?p.workers.length:null,partners:Array.isArray(p.partners)?p.partners.length:null,contractors:Array.isArray(p.contractors)?p.contractors.length:null,companies:Array.isArray(p.companies)?p.companies.length:null,companyJobs:Array.isArray(p.companyJobs)?p.companyJobs.length:null,profileKeys:Object.keys(p.profile||{}),subprojects:0,legacyMaterialRows:0,imageDataUriBytes:{logo:dataUriBytes(p.profile&&p.profile.logo),project:0,subproject:0}},contracts:{count:Array.isArray(x.contracts)?x.contracts.length:null,fields:Array.isArray(x.contracts)&&x.contracts[0]&&typeof x.contracts[0]==='object'?Object.keys(x.contracts[0]):[]}};
 if(Array.isArray(p.projects))p.projects.forEach((project,i)=>{if(!project||typeof project!=='object'){issues.push('Project index '+i+' is not an object');return}summary.projects.imageDataUriBytes.project+=dataUriBytes(project.photo);const subs=Array.isArray(project.subprojects)?project.subprojects:[];summary.projects.subprojects+=subs.length;subs.forEach(sub=>summary.projects.imageDataUriBytes.subproject+=dataUriBytes(sub&&sub.photo));for(const [path,obj] of [['project',project],...subs.map(v=>['subproject',v])]){if(!obj||typeof obj!=='object')continue;if(Array.isArray(obj.materials))summary.projects.legacyMaterialRows+=obj.materials.length;for(const field of ['expenses','income','receipts','payments'])if(obj[field]!==undefined&&!Array.isArray(obj[field]))notes.push(path+'.'+field+' is present but not an array')}})
 if(summary.projects.legacyMaterialRows)notes.push('Legacy materials rows detected. v212 project-load code may migrate these to expenses and write to Local Storage; do not run this migration against live Safari data.');
 if(!Array.isArray(x.contracts))issues.push('Contracts must be an array');
 const result=issues.length?'FAIL — required structure does not pass':'PASS — required v212 Restore structure passes';
 return {result,readOnly:true,summary,issues,notes};
}
const button=el('compatButton');
if(!button){setStatus('COMPATIBILITY CHECKER ERROR: button not found in page markup.','error');return}
button.addEventListener('click',async()=>{button.disabled=true;setStatus('Checking the saved backup against v212…');try{const db=await openLabDB();let rec;try{rec=await getRecord(db)}finally{db.close()}if(!rec)throw Error('No backup snapshot found. Run Step 1 first.');if(await sha256(rec.raw)!==rec.sha256)throw Error('Saved backup SHA-256 mismatch');const report=inspect(JSON.parse(rec.raw));el('details').textContent=JSON.stringify({database:DB,source:rec.sourceName,bytes:rec.bytes,sha256:rec.sha256,...report},null,2);setStatus(report.result+(report.issues.length?' — inspect details below.':' — inspection complete; live app data untouched.'),report.issues.length?'error':'ok')}catch(e){setStatus('COMPATIBILITY CHECK ERROR: '+(e.message||String(e)),'error')}finally{button.disabled=false}});
})();