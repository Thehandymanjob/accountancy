/* The Handyman Accountancy — isolated Accounting-only Backup v7
 * Scope: accounting DB object and invoice sequence only.
 * Never reads or writes Projects, Company, Contracts, profile, or other app keys.
 * Restore updates only the two allowlisted keys and retains a verified recovery snapshot.
 */
(function(root){
'use strict';
const APP='The Handyman Accountancy',SCHEMA=7;
const ACCOUNTING_KEY='tha_v212_migration_accounting_v1';
const SEQUENCE_KEY='tha_v212_migration_invoice_sequence_v1';
const RECOVERY_KEY='tha_accounting_backup_v7_recovery_v1';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function canonical(v){
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(x=>canonical(x)??'null').join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+(canonical(v[k])??'null')).join(',')+'}';
}
async function digest(v){
 if(!root.crypto||!root.crypto.subtle||typeof TextEncoder==='undefined')throw new Error('SHA-256 unavailable; backup cancelled.');
 const bytes=new TextEncoder().encode(canonical(v));
 const hash=await root.crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function parseAccounting(raw){
 if(raw===null)throw new Error('Accounting data is absent; backup cancelled.');
 let v;try{v=JSON.parse(raw)}catch(_){throw new Error('Accounting data is not valid JSON; original data left untouched.')}
 if(!v||typeof v!=='object'||Array.isArray(v)||!Array.isArray(v.entries)||!Array.isArray(v.customers)||!Array.isArray(v.invoices)||!v.settings||typeof v.settings!=='object'||Array.isArray(v.settings))
  throw new Error('Accounting data has an unexpected structure; backup cancelled.');
 if(v.customExpenseCategories!==undefined&&!Array.isArray(v.customExpenseCategories))throw new Error('Custom expense categories are invalid; backup cancelled.');
 return v;
}
function sequenceValue(raw){
 if(raw===null||raw==='')return 0;
 const n=Number(raw);if(!Number.isSafeInteger(n)||n<0)throw new Error('Invoice sequence is invalid.');
 return n;
}
function highestRecordNumber(accounting){
 if(!accounting||typeof accounting!=='object')return 0;
 const nums=[];
 if(Array.isArray(accounting.invoices))for(const i of accounting.invoices)nums.push(Number(i&&i.number)||0);
 if(Array.isArray(accounting.entries))for(const e of accounting.entries)if(e&&e.type==='income')nums.push(Number(e.number)||0);
 return nums.reduce((m,n)=>Number.isSafeInteger(n)&&n>m?n:m,0);
}
function safeMax(){
 return Math.max.apply(null,Array.from(arguments).map(n=>Number.isSafeInteger(n)&&n>=0?n:0));
}
async function buildBackup(storage,version){
 const accounting=parseAccounting(storage.getItem(ACCOUNTING_KEY));
 // Include actual invoice/income numbers, not just the stored high-water mark.
 const sequence=safeMax(sequenceValue(storage.getItem(SEQUENCE_KEY)),highestRecordNumber(accounting));
 const data={accounting,invoiceSequence:sequence};
 const integrity={accounting:await digest(accounting),invoiceSequence:await digest(sequence)};
 const payload={app:APP,backupType:'accounting-only',backupSchemaVersion:SCHEMA,appVersion:String(version||'unknown'),createdAt:new Date().toISOString(),data,integrity};
 const serialized=JSON.stringify(payload,null,2),copy=JSON.parse(serialized);
 if(await digest(copy.data.accounting)!==copy.integrity.accounting||await digest(copy.data.invoiceSequence)!==copy.integrity.invoiceSequence)throw new Error('Backup verification failed.');
 return {payload:copy,serialized};
}
async function validateBackup(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||p.app!==APP||p.backupType!=='accounting-only'||p.backupSchemaVersion!==SCHEMA||!p.data||!p.integrity||!own(p.data,'accounting')||!own(p.data,'invoiceSequence'))throw new Error('Unsupported or invalid Accounting Backup v7.');
 const accounting=parseAccounting(JSON.stringify(p.data.accounting));
 if(!Number.isSafeInteger(p.data.invoiceSequence)||p.data.invoiceSequence<0||p.data.invoiceSequence<highestRecordNumber(accounting))throw new Error('Invoice sequence is invalid or lower than a number contained in the backup.');
 if(await digest(p.data.accounting)!==p.integrity.accounting||await digest(p.data.invoiceSequence)!==p.integrity.invoiceSequence)throw new Error('Backup integrity check failed.');
 return true;
}
async function restoreBackup(p,storage,confirmFn){
 await validateBackup(p);
 if(typeof confirmFn!=='function'||!confirmFn('Restore Accounting only? Accounting records, customers, invoices and settings will be replaced. Projects and other sections will not be changed.'))return {restored:false,reason:'cancelled'};
 if(storage.getItem(RECOVERY_KEY)!==null)throw new Error('An existing Accounting recovery snapshot exists. Preserve it and resolve it before another restore.');
 const oldAccounting=storage.getItem(ACCOUNTING_KEY),oldSequence=storage.getItem(SEQUENCE_KEY);
 // Keep the prior raw strings exactly so rollback can restore byte-for-byte.
 const recoveryText=JSON.stringify({schema:2,createdAt:new Date().toISOString(),accounting:oldAccounting,invoiceSequence:oldSequence});
 storage.setItem(RECOVERY_KEY,recoveryText);
 if(storage.getItem(RECOVERY_KEY)!==recoveryText)throw new Error('Recovery snapshot verification failed; restore stopped before changing data.');
 let commit=false;
 try{
  const oldParsed=oldAccounting===null?null:parseAccounting(oldAccounting);
  // Never lower the high-water mark: include old stored value, old records,
  // imported stored value, and all imported invoice/income numbers.
  const nextSequence=safeMax(sequenceValue(oldSequence),highestRecordNumber(oldParsed),p.data.invoiceSequence,highestRecordNumber(p.data.accounting));
  commit=true;
  storage.setItem(ACCOUNTING_KEY,JSON.stringify(p.data.accounting));
  storage.setItem(SEQUENCE_KEY,String(nextSequence));
  if(canonical(parseAccounting(storage.getItem(ACCOUNTING_KEY)))!==canonical(p.data.accounting))throw new Error('Accounting read-back verification failed.');
  if(sequenceValue(storage.getItem(SEQUENCE_KEY))!==nextSequence)throw new Error('Invoice sequence read-back verification failed.');
  return {restored:true,recoveryKey:RECOVERY_KEY,invoiceSequence:nextSequence,note:'Recovery snapshot retained until separately verified.'};
 }catch(err){
  let rollbackOK=true;
  if(commit){
   try{
    if(oldAccounting===null)storage.removeItem(ACCOUNTING_KEY);else storage.setItem(ACCOUNTING_KEY,oldAccounting);
    if(oldSequence===null)storage.removeItem(SEQUENCE_KEY);else storage.setItem(SEQUENCE_KEY,oldSequence);
    if(storage.getItem(ACCOUNTING_KEY)!==oldAccounting||storage.getItem(SEQUENCE_KEY)!==oldSequence)throw new Error('Rollback read-back failed.');
   }catch(_){rollbackOK=false;}
  }
  if(rollbackOK){try{storage.removeItem(RECOVERY_KEY)}catch(_){}throw new Error('Restore failed; previous Accounting data rollback was verified. '+err.message);}
  throw new Error('CRITICAL: Accounting restore and rollback could not be verified. Keep '+RECOVERY_KEY+' and do not clear browser storage. '+err.message);
 }
}
async function exportToDownload(storage,version){
 const result=await buildBackup(storage,version);
 const blob=new Blob([result.serialized],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='The_Handyman_Accounting_Backup_v7_'+new Date().toISOString().slice(0,10)+'.json';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 return {initiated:true,verified:true};
}
root.HandymanAccountingBackupV7=Object.freeze({schemaVersion:SCHEMA,keys:Object.freeze({accounting:ACCOUNTING_KEY,invoiceSequence:SEQUENCE_KEY,recovery:RECOVERY_KEY}),highestRecordNumber,buildBackup,validateBackup,restoreBackup,exportToDownload});
})(typeof window!=='undefined'?window:globalThis);
