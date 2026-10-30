/* v213 isolated crash-safe restore override.
   All keys are test-prefixed. Never reads or writes production storage keys. */
(function(){
'use strict';
const DB_NAME='tha_restore_test_v1_recovery',STORE='restoreJournal';
const KEYS=['tha_restore_test_v1_accounting_v1','tha_restore_test_v1_projects_v1','tha_restore_test_v1_contracts_v1'];

function openDB(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window))return reject(new Error('IndexedDB is unavailable'));
  const r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error||new Error('Could not open recovery database'));
  r.onblocked=()=>reject(new Error('Recovery database is blocked'));
 });
}
async function putJournal(value){
 const d=await openDB();
 try{await new Promise((resolve,reject)=>{
  const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(value,'active');
  t.oncomplete=resolve;t.onerror=()=>reject(t.error||new Error('Journal write failed'));
  t.onabort=()=>reject(t.error||new Error('Journal write aborted'));
 })}finally{d.close()}
}
async function getJournal(){
 const d=await openDB();
 try{return await new Promise((resolve,reject)=>{
  const t=d.transaction(STORE,'readonly'),r=t.objectStore(STORE).get('active');
  r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error||new Error('Journal read failed'));
 })}finally{d.close()}
}
async function clearJournal(){
 const d=await openDB();
 try{await new Promise((resolve,reject)=>{
  const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).delete('active');
  t.oncomplete=resolve;t.onerror=()=>reject(t.error||new Error('Journal cleanup failed'));
  t.onabort=()=>reject(t.error||new Error('Journal cleanup aborted'));
 })}finally{d.close()}
}
function writeExact(key,value){
 if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
 if(localStorage.getItem(key)!==value)throw new Error('Storage read-back failed: '+key);
}
function collectImages(value,path,found){
 if(!value||typeof value!=='object')return found;
 if(Array.isArray(value)){value.forEach((v,i)=>collectImages(v,path+'['+i+']',found));return found}
 for(const [key,item] of Object.entries(value)){
  const next=path+'.'+key;
  if(typeof item==='string'&&item.startsWith('data:image/'))found.push({path:next,data:item});
  else if(item&&typeof item==='object')collectImages(item,next,found);
 }
 return found;
}
function summarize(data,projects,contracts){
 const images=collectImages({data,projects,contracts},'backup',[]);
 return {
  accountingEntries:data.entries.length,customers:data.customers.length,invoices:data.invoices.length,
  projects:projects&&Array.isArray(projects.projects)?projects.projects.length:0,
  workers:projects&&Array.isArray(projects.workers)?projects.workers.length:0,
  contractors:projects&&Array.isArray(projects.contractors)?projects.contractors.length:0,
  contracts:contracts.length,imageCount:images.length,
  imagePaths:images.map(x=>x.path),imageCharacters:images.reduce((n,x)=>n+x.data.length,0)
 };
}
async function verifyImages(images){
 for(const item of images){
  if(!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(item.data))throw new Error('Unsupported or malformed image data: '+item.path);
  const base64=item.data.slice(item.data.indexOf(',')+1);
  if(!base64||base64.length%4===1)throw new Error('Invalid base64 image data: '+item.path);
  try{atob(base64)}catch(e){throw new Error('Image base64 verification failed: '+item.path)}
  await new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>img.naturalWidth>0&&img.naturalHeight>0?resolve():reject(new Error('Image has invalid dimensions: '+item.path));
   img.onerror=()=>reject(new Error('Image decode failed: '+item.path));img.src=item.data;
  });
 }
}
function readFile(file){
 return new Promise((resolve,reject)=>{
  const r=new FileReader();r.onload=()=>resolve(String(r.result||''));
  r.onerror=()=>reject(r.error||new Error('Could not read backup file'));r.readAsText(file);
 });
}
function refreshApp(){
 if(typeof refreshAll==='function')refreshAll();
 if(typeof prLoad==='function')prLoad();
 if(typeof ctRenderSaved==='function')ctRenderSaved();
 if(document.body.classList.contains('projects-open')&&typeof openProjectsApp==='function')openProjectsApp();
}

window.restore=async function(event){
 const file=event&&event.target&&event.target.files&&event.target.files[0];if(!file)return;
 const input=event.target;
 let journalReady=false,oldDB=null,oldPrDB=null,oldAvailable=storageAvailable,oldIntegrity=accountingDataIntegrityError;
 try{
  const raw=await readFile(file),parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid backup root');
  if(parsed.app!==undefined&&parsed.app!=='The Handyman Accountancy')throw Error('Backup belongs to another app');
  if(parsed.backupType!==undefined&&parsed.backupType!=='complete-user-data')throw Error('Invalid backup type');
  const d=parsed.data||parsed;
  if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.entries)||!Array.isArray(d.customers)||!Array.isArray(d.invoices)||!d.settings||typeof d.settings!=='object'||Array.isArray(d.settings))throw Error('Accounting section is incomplete or invalid');
  const hasProjects=Object.prototype.hasOwnProperty.call(parsed,'projects'),hasContracts=Object.prototype.hasOwnProperty.call(parsed,'contracts');
  if(parsed.backupType==='complete-user-data'&&(!hasProjects||!hasContracts))throw Error('Complete backup is missing Projects or Contracts');
  if(!hasProjects||!hasContracts)throw Error('This test requires the complete backup, including Projects and Contracts');
  if(parsed.projects!==null&&(!parsed.projects||typeof parsed.projects!=='object'||Array.isArray(parsed.projects)||!Array.isArray(parsed.projects.projects)||!Array.isArray(parsed.projects.workers)||!parsed.projects.profile||typeof parsed.projects.profile!=='object'||Array.isArray(parsed.projects.profile)))throw Error('Projects/profile section is invalid');
  if(!Array.isArray(parsed.contracts))throw Error('Contracts section is invalid');

  const nextDB={...defaultDB(),...d,customers:d.customers,invoices:d.invoices,settings:{...defaultDB().settings,...d.settings}};
  const next={
   [KEY]:JSON.stringify(nextDB),
   [KEYS[1]]:parsed.projects===null?null:JSON.stringify(parsed.projects),
   [KEYS[2]]:JSON.stringify(parsed.contracts)
  };
  const images=collectImages({data:d,projects:parsed.projects,contracts:parsed.contracts},'backup',[]);
  await verifyImages(images);
  const incomingSummary=summarize(d,parsed.projects,parsed.contracts);

  const old=Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]));
  oldDB=JSON.parse(JSON.stringify(db));oldPrDB=JSON.parse(JSON.stringify(prDB));
  const scope='complete user data';
  const summaryText=[
   incomingSummary.accountingEntries+' accounting entries',
   incomingSummary.customers+' customers',
   incomingSummary.invoices+' invoices',
   incomingSummary.projects+' projects',
   incomingSummary.workers+' workers',
   incomingSummary.contractors+' contractors',
   incomingSummary.contracts+' contracts',
   incomingSummary.imageCount+' verified images'
  ].join(', ');
  if(!confirm('Restore '+scope+' into this isolated test app?\n\nBackup contents: '+summaryText+'.\n\nExisting test records will be replaced only after the previous test data is saved and verified in IndexedDB. The live app is not accessed.'))return;

  const journal={schema:2,phase:'prepared',createdAt:new Date().toISOString(),oldValues:old,incomingLengths:Object.fromEntries(KEYS.map(k=>[k,next[k]===null?null:next[k].length])),incomingSummary};
  await putJournal(journal);
  const check=await getJournal();
  if(!check||check.schema!==2||JSON.stringify(check.oldValues)!==JSON.stringify(old)||JSON.stringify(check.incomingLengths)!==JSON.stringify(journal.incomingLengths)||JSON.stringify(check.incomingSummary)!==JSON.stringify(incomingSummary))throw Error('IndexedDB recovery snapshot failed read-back verification; no app data was changed');
  journalReady=true;
  journal.phase='applying';await putJournal(journal);

  for(const key of KEYS)writeExact(key,next[key]);
  const storedData=JSON.parse(localStorage.getItem(KEY)||'null');
  const storedProjectsRaw=localStorage.getItem(KEYS[1]);const storedProjects=storedProjectsRaw===null?null:JSON.parse(storedProjectsRaw);
  const storedContracts=JSON.parse(localStorage.getItem(KEYS[2])||'null');
  if(!storedData||!Array.isArray(storedData.entries)||!Array.isArray(storedData.customers)||!Array.isArray(storedData.invoices)||!storedData.settings||typeof storedData.settings!=='object')throw Error('Accounting verification failed');
  if(storedProjects===null){if(parsed.projects!==null)throw Error('Projects data is missing after restore')}else if(!Array.isArray(storedProjects.projects)||!Array.isArray(storedProjects.workers)||!storedProjects.profile||typeof storedProjects.profile!=='object'||Array.isArray(storedProjects.profile))throw Error('Projects/profile verification failed');
  if(!Array.isArray(storedContracts))throw Error('Contracts verification failed');
  if(JSON.stringify(storedData)!==JSON.stringify(nextDB)||JSON.stringify(storedProjects)!==JSON.stringify(parsed.projects)||JSON.stringify(storedContracts)!==JSON.stringify(parsed.contracts))throw Error('Restored sections do not exactly match the source backup');
  const verifiedSummary=summarize(storedData,storedProjects,storedContracts);
  if(JSON.stringify(verifiedSummary)!==JSON.stringify(incomingSummary))throw Error('Restored record/image counts do not match the source backup');
  await verifyImages(collectImages({data:storedData,projects:storedProjects,contracts:storedContracts},'restored',[]));
  for(const key of KEYS)if(localStorage.getItem(key)!==next[key])throw Error('Exact-value verification failed: '+key);

  journal.phase='committed';journal.committedAt=new Date().toISOString();await putJournal(journal);
  db=nextDB;if(storedProjects===null){prDB={projects:[],workers:[],partners:[],contractors:[],companies:[],companyJobs:[],profile:{},current:null,guide:'en'};projectsDataIntegrityError=false;}storageAvailable=true;accountingDataIntegrityError=false;refreshApp();
  await clearJournal();
  alert('TEST RESTORE SUCCESSFUL. All included accounting, customer, invoice, project, worker, contractor, contract, profile/logo and embedded image data (when present) were compared with the source backup. IndexedDB pre-restore snapshot and restored data were verified.\n\n'+summaryText+'\n\nThis was the isolated v213 test app only.');
 }catch(error){
  if(journalReady){
   try{
    const journal=await getJournal();if(!journal||!journal.oldValues)throw Error('Recovery journal is missing');
    for(const key of KEYS)writeExact(key,Object.prototype.hasOwnProperty.call(journal.oldValues,key)?journal.oldValues[key]:null);
    for(const key of KEYS)if(localStorage.getItem(key)!==(Object.prototype.hasOwnProperty.call(journal.oldValues,key)?journal.oldValues[key]:null))throw Error('Rollback verification failed: '+key);
    await clearJournal();if(oldDB)db=oldDB;if(oldPrDB)prDB=oldPrDB;storageAvailable=oldAvailable;accountingDataIntegrityError=oldIntegrity;refreshApp();
    alert('RESTORE FAILED. Previous test data was restored and verified.\n\nDetails: '+(error.message||error));
   }catch(rollbackError){
    storageAvailable=false;accountingDataIntegrityError=true;
    alert('CRITICAL: Restore failed and rollback could not be verified. Do not clear Safari data or continue editing this test app.\n\nDetails: '+(rollbackError.message||rollbackError));
   }
  }else{
   alert('Restore stopped safely. No test data was changed. If an IndexedDB journal was written, the startup recovery check will resolve it before the app opens.\n\nDetails: '+(error.message||error));
  }
 }finally{if(input)input.value=''}
};
})();

/* v213 isolated navigation persistence.
   Remembers only the last visible app section in a test-prefixed key.
   Does not read, modify, or migrate accounting/project/contract records. */
(function(){
'use strict';
const NAV_KEY='tha_restore_test_v1_navigation_state';
let restoring=false;
function readState(){try{const x=JSON.parse(localStorage.getItem(NAV_KEY)||'null');return x&&typeof x==='object'?x:null}catch(e){return null}}
function saveState(x){if(restoring)return;try{localStorage.setItem(NAV_KEY,JSON.stringify({...x,savedAt:new Date().toISOString()}))}catch(e){console.warn('Test navigation state could not be saved',e)}}
function wrap(name,after){
 const original=window[name];if(typeof original!=='function'||original.__thaNavWrapped)return;
 const wrapped=function(){const result=original.apply(this,arguments);try{after.apply(this,arguments)}catch(e){console.warn('Navigation state update skipped',e)}return result};
 wrapped.__thaNavWrapped=true;window[name]=wrapped;
}
wrap('show',function(id){saveState({mode:'accountancy',page:id})});
wrap('prPage',function(name){saveState({mode:'projects',page:name,projectId:prDB&&prDB.current||null,subprojectId:prDB&&prDB.currentSubproject||null,detailTab:typeof prSubFinanceTab==='string'?prSubFinanceTab:'income'})});
wrap('prOpenProject',function(id){saveState({mode:'projects',page:'detail',projectId:id,subprojectId:null,detailTab:'income'})});
wrap('prOpenSubproject',function(id){saveState({mode:'projects',page:'detail',projectId:prDB&&prDB.current||null,subprojectId:id,detailTab:typeof prSubFinanceTab==='string'?prSubFinanceTab:'income'})});
wrap('prBackToSubprojects',function(){saveState({mode:'projects',page:'detail',projectId:prDB&&prDB.current||null,subprojectId:null,detailTab:'income'})});
wrap('prDetailTab',function(tab){saveState({mode:'projects',page:'detail',projectId:prDB&&prDB.current||null,subprojectId:prDB&&prDB.currentSubproject||null,detailTab:tab||'summary'})});
wrap('openContractsApp',function(){saveState({mode:'contracts',page:'contracts'})});
wrap('closeContractsApp',function(){saveState({mode:'launcher',page:'launcher'})});
wrap('returnToLauncher',function(){saveState({mode:'launcher',page:'launcher'})});

function restoreNavigation(){
 const state=readState();if(!state||restoring)return;
 restoring=true;
 try{
  if(state.mode==='projects'&&typeof openProjectsApp==='function'&&typeof prPage==='function'){
   openProjectsApp();
   const page=typeof state.page==='string'&&document.getElementById('prPage-'+state.page)?state.page:'workspace';
   if(state.projectId&&prDB&&Array.isArray(prDB.projects)&&prDB.projects.some(p=>p.id===state.projectId))prDB.current=state.projectId;
   if(page==='detail'&&!prDB.current)prPage('list');
   else{
    prPage(page);
    if(page==='detail'&&typeof prRenderDetail==='function'){
     prDB.currentSubproject=state.subprojectId&&prDB.current&&prDB.projects.find(p=>p.id===prDB.current)?.subprojects?.some(x=>x.id===state.subprojectId)?state.subprojectId:null;
     prRenderDetail('summary');
     if(state.detailTab&&state.detailTab!=='income'&&typeof prDetailTab==='function')prDetailTab(state.detailTab);
    }
   }
  }else if(state.mode==='accountancy'&&typeof show==='function'&&document.getElementById(state.page)){
   // Do not auto-restore transient settings pages on startup. A saved language/settings
   // page can look like an unexpected redirect and obscure whether the app launcher works.
   if(['settings','backup','profileGuide','helpHub','userGuide','softwareUpdate','factoryResetPage','languageSettings'].includes(state.page))return;
   document.body.classList.add('accountancy-open');
   show(state.page);
  }else if(state.mode==='contracts'&&typeof openContractsApp==='function'){
   openContractsApp();
  }
 }catch(e){console.warn('Saved test navigation could not be restored; app remains available from the launcher.',e)}
 finally{restoring=false}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(restoreNavigation,0),{once:true});
else setTimeout(restoreNavigation,0);
})();
