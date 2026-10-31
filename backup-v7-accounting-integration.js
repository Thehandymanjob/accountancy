/* Isolated adapter for connecting Accounting Backup v7 to app loadDB().
 * The caller must inject storage and reload; this file never reaches into app globals itself.
 */
(function(root){
'use strict';
async function restoreAndReload(payload,options){
 const o=options||{},storage=o.storage,reload=o.reload,confirmFn=o.confirm;
 if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function')throw new Error('A compatible storage adapter is required.');
 if(typeof reload!=='function')throw new Error('An app reload callback is required.');
 const api=root.HandymanAccountingBackupV7;
 if(!api)throw new Error('Accounting Backup v7 module is not loaded.');
 const result=await api.restoreBackup(payload,storage,confirmFn);
 if(!result.restored)return result;
 let reloaded=false;
 try{
  const ok=await reload();
  if(ok===false)throw new Error('App loadDB rejected restored Accounting data.');
  reloaded=true;
  return {...result,reloaded:true};
 }catch(reloadError){
  const recoveryRaw=storage.getItem(api.keys.recovery);
  if(!recoveryRaw)throw new Error('CRITICAL: App reload failed and recovery snapshot is missing. Do not clear storage. '+reloadError.message);
  let recovery;
  try{recovery=JSON.parse(recoveryRaw)}catch(_){throw new Error('CRITICAL: App reload failed and recovery snapshot is unreadable. Preserve storage. '+reloadError.message);}
  if(recovery.schema!==1||!Object.prototype.hasOwnProperty.call(recovery,'accounting')||!Object.prototype.hasOwnProperty.call(recovery,'invoiceSequence'))throw new Error('CRITICAL: App reload failed and recovery snapshot structure is invalid. Preserve storage.');
  try{
   if(recovery.accounting===null)storage.removeItem(api.keys.accounting);else storage.setItem(api.keys.accounting,recovery.accounting);
   if(recovery.invoiceSequence===null)storage.removeItem(api.keys.invoiceSequence);else storage.setItem(api.keys.invoiceSequence,recovery.invoiceSequence);
   if(storage.getItem(api.keys.accounting)!==recovery.accounting||storage.getItem(api.keys.invoiceSequence)!==recovery.invoiceSequence)throw new Error('Recovery read-back mismatch.');
   const rollbackReload=await reload();
   if(rollbackReload===false)throw new Error('App rejected restored original Accounting data.');
   return {restored:false,rolledBack:true,recoveryRetained:true,reason:'app_reload_failed',message:reloadError.message};
  }catch(rollbackError){
   throw new Error('CRITICAL: App reload failed and Accounting rollback could not be verified. Keep '+api.keys.recovery+' and do not clear browser storage. '+rollbackError.message);
  }
 }
}
root.HandymanAccountingBackupV7Integration=Object.freeze({restoreAndReload});
})(typeof window!=='undefined'?window:globalThis);
