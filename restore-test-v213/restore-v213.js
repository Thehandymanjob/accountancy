/* v213 isolated crash-safe restore override. */
(function(){
'use strict';
const DB_NAME='tha_restore_test_v1_recovery',STORE='restoreJournal';
const KEYS=[KEY,'tha_restore_test_v1_projects_v1','tha_restore_test_v1_contracts_v1'];
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Could not open recovery database'));r.onblocked=()=>reject(new Error('Recovery database is blocked'))})}
async function putJournal(v){const d=await openDB();try{await new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(v,'active');t.oncomplete=resolve;t.onerror=()=>reject(t.error||new Error('Journal write failed'));t.onabort=()=>reject(t.error||new Error('Journal write aborted'))})}finally{d.close()}}
async function getJournal(){const d=await openDB();try{return await new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readonly');const r=t.objectStore(STORE).get('active');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error||new Error('Journal read failed'))})}finally{d.close()}}
async function clearJournal(){const d=await openDB();try{await new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).delete('active');t.oncomplete=resolve;t.onerror=()=>reject(t.error||new Error('Journal cleanup failed'))})}finally{d.close()}}
function writeExact(k,v){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);if(localStorage.getItem(k)!==v)throw new Error('Storage read-back failed: '+k)}
window.restore=async function(e){
 const file=e&&e.target&&e.target.files&&e.target.files[0];if(!file)return;
 const input=e.target;let journalReady=false,oldDB=null,oldAvailable=storageAvailable,oldIntegrity=accountingDataIntegrityError;
 try{
  const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Could not read backup'));r.readAsText(file)});
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid backup root');
  if(parsed.app!==undefined&&parsed.app!=='The Handyman Accountancy')throw Error('Backup belongs to another app');
  if(parsed.backupType!==undefined&&parsed.backupType!=='complete-user-data')throw Error('Invalid backup type');
  const d=parsed.data||parsed;
  if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.entries)||!Array.isArray(d.customers)||!Array.isArray(d.invoices)||!d.settings||typeof d.settings!=='object'||Array.isArray(d.settings))throw Error('Accounting section is incomplete or invalid');
  const hp=Object.prototype.hasOwnProperty.call(parsed,'projects'),hc=Object.prototype.hasOwnProperty.call(parsed,'contracts');
  if(parsed.backupType==='complete-user-data'&&(!hp||!hc))throw Error('Complete backup is missing Projects or Contracts');
  if(hp&&parsed.projects!==null&&(!parsed.projects||typeof parsed.projects!=='object'||Array.isArray(parsed.projects)||!Array.isArray(parsed.projects.projects)||!Array.isArray(parsed.projects.workers)||!parsed.projects.profile||typeof parsed.projects.profile!=='object'||Array.isArray(parsed.projects.profile)))throw Error('Projects/profile section is invalid');
  if(hc&&!Array.isArray(parsed.contracts))throw Error('Contracts section is invalid');
  const nextDB={...defaultDB(),...d,customers:d.customers,invoices:d.invoices,settings:{...defaultDB().settings,...d.settings}};
  const next={
   [KEY]:JSON.stringify(nextDB),
   [KEYS[1]]:hp?(parsed.projects===null?null:JSON.stringify(parsed.projects)):localStorage.getItem(KEYS[1]),
   [KEYS[2]]:hc?JSON.stringify(parsed.contracts):localStorage.getItem(KEYS[2])
  };
  const scope=hp&&hc?'complete user data (accounting, projects/profile/images and contracts)':hp?'accounting and projects/profile':'accounting only';
  if(!confirm('Restore '+scope+' into this isolated test app? Existing test records will be replaced. The previous data will first be saved and verified in IndexedDB.'))return;
  const old=Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]));oldDB=JSON.parse(JSON.stringify(db));
  const j={schema:1,phase:'prepared',createdAt:new Date().toISOString(),oldValues:old,incomingLengths:Object.fromEntries(KEYS.map(k=>[k,next[k]===null?null:next[k].length]))};
  await putJournal(j);
  const check=await getJournal();
  if(!check||JSON.stringify(check.oldValues)!==JSON.stringify(old)||JSON.stringify(check.incomingLengths)!==JSON.stringify(j.incomingLengths))throw Error('IndexedDB recovery journal failed read-back verification; no app data was changed');
  journalReady=true;j.phase='applying';await putJournal(j);
  for(const k of KEYS)writeExact(k,next[k]);
  const vd=JSON.parse(localStorage.getItem(KEY)||'null');
  if(!vd||!Array.isArray(vd.entries)||!Array.isArray(vd.customers)||!Array.isArray(vd.invoices)||!vd.settings||typeof vd.settings!=='object')throw Error('Accounting verification failed');
  if(hp&&next[KEYS[1]]!==null){const p=JSON.parse(localStorage.getItem(KEYS[1])||'null');if(!p||!Array.isArray(p.projects)||!Array.isArray(p.workers)||!p.profile||typeof p.profile!=='object')throw Error('Projects verification failed')}
  if(hc&&!Array.isArray(JSON.parse(localStorage.getItem(KEYS[2])||'null')))throw Error('Contracts verification failed');
  for(const k of KEYS)if(localStorage.getItem(k)!==next[k])throw Error('Exact-value verification failed: '+k);
  j.phase='committed';j.committedAt=new Date().toISOString();await putJournal(j);
  db=nextDB;storageAvailable=true;accountingDataIntegrityError=false;
  refreshAll();if(typeof prLoad==='function')prLoad();if(typeof ctRenderSaved==='function')ctRenderSaved();if(document.body.classList.contains('projects-open')&&typeof openProjectsApp==='function')openProjectsApp();
  await clearJournal();
  alert('TEST RESTORE SUCCESSFUL. Accounting, Projects/profile/images and Contracts were written and verified in the isolated test app. Live app data was not accessed.');
 }catch(err){
  if(journalReady){try{const j=await getJournal();if(!j||!j.oldValues)throw Error('Recovery journal missing');for(const k of KEYS)writeExact(k,Object.prototype.hasOwnProperty.call(j.oldValues,k)?j.oldValues[k]:null);for(const k of KEYS)if(localStorage.getItem(k)!==(Object.prototype.hasOwnProperty.call(j.oldValues,k)?j.oldValues[k]:null))throw Error('Rollback verification failed');await clearJournal();if(oldDB)db=oldDB;storageAvailable=oldAvailable;accountingDataIntegrityError=oldIntegrity;alert('Restore failed. Previous test data was restored and verified. Details: '+(err.message||err))}
   catch(rb){storageAvailable=false;accountingDataIntegrityError=true;alert('CRITICAL: Restore failed and rollback could not be verified. Do not clear Safari data or continue editing this test app. Details: '+(rb.message||rb))}}
  else alert('Restore cancelled safely. No existing test data was changed. Details: '+(err.message||err));
 }finally{if(input)input.value=''}
};
})();