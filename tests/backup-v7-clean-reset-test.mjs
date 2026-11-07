import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const names=['index.html','version-manager.js','service-worker.js','storage-foundation.js','version.json','update-channel.json'];
const assets=Object.fromEntries(await Promise.all(names.map(async n=>[n,await readFile(resolve(n))])));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname;const name=path==='/'?'index.html':path.length>1?path.slice(1):'index.html';const body=assets[name];if(!body){res.writeHead(404);res.end('Not found');return}const type=name.endsWith('.json')?'application/json':name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8';res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body)});
await new Promise(resolve=>server.listen(4175,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
try{
 const page=await browser.newPage();page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:4175/');
 await page.waitForFunction(()=>!!window.HandymanStorageFoundation);
 await page.evaluate(async()=>{
  localStorage.setItem('tha_v206_accounting_v1',JSON.stringify({entries:[{id:'restore-entry',amount:987}],customers:[{id:'restore-customer',name:'Backup Customer'}],invoices:[{id:'restore-invoice',number:42}],settings:{businessName:'Backup Business'}}));
  localStorage.setItem('tha_v206_projects_v1',JSON.stringify({projects:[{id:'restore-project',name:'Photo Project',photo:'data:image/jpeg;base64,PROJECT_IMAGE_DATA'}],workers:[],partners:[],contractors:[],companies:[],companyJobs:[],profile:{businessName:'Backup Business',logo:'data:image/png;base64,LOGO_IMAGE_DATA'}}));
  localStorage.setItem('tha_v206_contracts_v1',JSON.stringify([{id:'restore-contract',title:'Backup Contract'}]));
  localStorage.setItem('tha_v206_invoice_sequence_v1','42');
  localStorage.setItem('tha_v206_report_archive_v1',JSON.stringify([{id:'report-1',title:'Saved report'}]));
  localStorage.setItem('handyman_app_language_v1','fa');
  localStorage.setItem('handyman_monitor_log_v1',JSON.stringify([{event:'OLD-LOCAL-DIAGNOSTIC'}]));
  const api=window.HandymanStorageFoundation,db=await api.openDatabase(),stores=api.stores;
  await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');for(const n of stores){const o=tx.objectStore(n);if(n==='kv'){o.put({key:'user-setting-preserve',value:'kv-value'});o.put({key:'handyman_monitor_log_v1',value:'OLD-IDB-DIAGNOSTIC'})}else if(n==='auditLog')o.put({id:'old-audit-log',event:'OLD-IDB-AUDIT'});else o.put({id:'seed-'+n,payload:'record-'+n})}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('seed transaction aborted'))});
  db.close();
 });
 const downloadPromise=page.waitForEvent('download');
 const backupResult=await page.evaluate(()=>window.backup());
 assert(backupResult===true,'Backup v7 did not report success');
 const download=await downloadPromise,stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
 const backupBuffer=Buffer.concat(chunks),payload=JSON.parse(backupBuffer.toString('utf8'));
 assert(payload.schema==='tha-complete-backup-v7','Wrong backup schema');
 const ls=payload.storage.localStorage,idb=payload.storage.indexedDB.stores;
 assert(ls['tha_v206_invoice_sequence_v1']==='42','Invoice sequence missing from backup');
 assert(ls['tha_v206_report_archive_v1']?.includes('Saved report'),'Report archive missing from backup');
 assert(ls['handyman_app_language_v1']==='fa','Language preference missing from backup');
 assert(!Object.keys(ls).some(k=>/(monitor|diagnostic|audit[_-]?log)/i.test(k)),'Diagnostic LocalStorage logs should not be included');
 assert(idb.auditLog.length===0,'IndexedDB audit log should not be included');
 assert(!idb.kv.some(x=>/monitor|diagnostic|audit[_-]?log/i.test(String(x.key||''))),'IndexedDB diagnostic KV item should not be included');
 assert(idb.projects.some(x=>x.id==='seed-projects'),'Project IndexedDB record missing from backup');
 assert(idb.kv.some(x=>x.key==='user-setting-preserve'),'Non-diagnostic KV record missing from backup');
 
 await page.evaluate(()=>{factoryResetStage=2;document.getElementById('factoryResetFinalButton').hidden=false;document.getElementById('factoryResetAcknowledgeBackup').hidden=true});
 const resetNav=page.waitForNavigation({waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{void window.factoryResetFinalConfirm();return true});
 await resetNav;
 const clean=await page.evaluate(async()=>{
  const keys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>/^(tha_|handyman_)/i.test(k));
  const values=keys.map(k=>localStorage.getItem(k)||'').join(' ');
  const dbs=typeof indexedDB.databases==='function'?(await indexedDB.databases()).map(x=>x.name):[];
  return {keys,oldLocalLog:values.includes('OLD-LOCAL-DIAGNOSTIC'),oldImage:values.includes('LOGO_IMAGE_DATA'),dbs};
 });
 assert(!clean.keys.includes('tha_v206_accounting_v1')&&!clean.keys.includes('tha_v206_projects_v1')&&!clean.keys.includes('tha_v206_contracts_v1'),'Factory Reset left core records');
 assert(!clean.oldLocalLog&&!clean.oldImage,'Factory Reset left old diagnostic or logo data');
 assert(!clean.dbs.some(n=>/the_handyman_accountancy_v250_idb/i.test(n)),'Factory Reset left the production IndexedDB database');

 const restoreNav=page.waitForNavigation({waitUntil:'domcontentloaded'});
 await page.locator('#restoreFile').setInputFiles({name:'complete-v7-backup.json',mimeType:'application/json',buffer:backupBuffer});
 await restoreNav;
 const restored=await page.evaluate(async()=>{
  const a=JSON.parse(localStorage.getItem('tha_v206_accounting_v1')||'null'),p=JSON.parse(localStorage.getItem('tha_v206_projects_v1')||'null'),c=JSON.parse(localStorage.getItem('tha_v206_contracts_v1')||'null');
  const db=await window.HandymanStorageFoundation.openDatabase(),names=window.HandymanStorageFoundation.stores,tx=db.transaction(names,'readonly');
  const read=async n=>new Promise((resolve,reject)=>{const q=tx.objectStore(n).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  const rows={};for(const n of names)rows[n]=await read(n);db.close();
  return {a,p,c,sequence:localStorage.getItem('tha_v206_invoice_sequence_v1'),report:localStorage.getItem('tha_v206_report_archive_v1'),language:localStorage.getItem('handyman_app_language_v1'),monitor:localStorage.getItem('handyman_monitor_log_v1'),rows};
 });
 assert(restored.a.entries[0].id==='restore-entry','Accounting record not restored');
 assert(restored.p.profile.logo==='data:image/png;base64,LOGO_IMAGE_DATA','Business logo not restored');
 assert(restored.p.projects[0].photo==='data:image/jpeg;base64,PROJECT_IMAGE_DATA','Project image not restored');
 assert(restored.c[0].id==='restore-contract','Contract not restored');
 assert(restored.sequence==='42','Invoice sequence not restored');
 assert(restored.report?.includes('Saved report'),'Report archive not restored');
 assert(restored.language==='fa','Language preference not restored');
 assert(!String(restored.monitor||'').includes('OLD-LOCAL-DIAGNOSTIC'),'Old diagnostic log was restored');
 assert(restored.rows.projects.some(x=>x.id==='seed-projects'),'IndexedDB project record not restored');
 assert(restored.rows.kv.some(x=>x.key==='user-setting-preserve'),'IndexedDB KV record not restored');
 assert(restored.rows.auditLog.length===0,'Old IndexedDB audit log was restored');
 assert(!restored.rows.kv.some(x=>/monitor|diagnostic|audit[_-]?log/i.test(String(x.key||''))),'Old diagnostic KV data was restored');
 console.log('Complete v7 clean-reset round trip passed: LocalStorage, IndexedDB, reports, sequence, language, logo, project image and contracts restored; diagnostic logs excluded; full reset cleared prior records and production IndexedDB.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
