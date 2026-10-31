/* The Handyman Accountancy — isolated Accounting v7 app adapter
 * Not loaded by index.html. Requires an explicit app bridge at call time.
 * It only coordinates Accounting reload/refresh; it never reads other app sections.
 */
(function(root){
 'use strict';
 function writeRaw(storage,key,value){
  if(value===null)storage.removeItem(key);else storage.setItem(key,value);
  if(storage.getItem(key)!==value)throw new Error('Storage rollback verification failed for '+key+'.');
 }
 async function restoreAndRefresh(payload,storage,confirmFn,appBridge){
  const api=root.HandymanAccountingBackupV7;
  if(!api||typeof api.restoreBackup!=='function')throw new Error('Accounting Backup v7 module is not loaded.');
  if(!appBridge||typeof appBridge.reloadAccounting!=='function'||typeof appBridge.refreshAccountingViews!=='function'){
   throw new Error('The Accounting app bridge is incomplete. No restore was started.');
  }
  const result=await api.restoreBackup(payload,storage,confirmFn);
  if(!result||result.restored!==true)return result||{restored:false,reason:'cancelled'};
  try{
   const reloaded=await appBridge.reloadAccounting();
   if(reloaded===false)throw new Error('Accounting data reload was rejected.');
   const refreshed=await appBridge.refreshAccountingViews();
   if(refreshed===false)throw new Error('Accounting views did not refresh.');
   return Object.assign({},result,{appRefreshed:true,recoveryRetained:true});
  }catch(refreshError){
   let snapshot;
   try{
    const raw=storage.getItem(result.recoveryKey);
    if(!raw)throw new Error('Recovery snapshot is missing.');
    snapshot=JSON.parse(raw);
    if(!snapshot||snapshot.schema!==2||!snapshot.createdAt||
       !Object.prototype.hasOwnProperty.call(snapshot,'accounting')||
       !Object.prototype.hasOwnProperty.call(snapshot,'invoiceSequence')){
      throw new Error('Recovery snapshot is malformed.');
    }
    writeRaw(storage,api.keys.accounting,snapshot.accounting);
    writeRaw(storage,api.keys.invoiceSequence,snapshot.invoiceSequence);
    const oldReload=await appBridge.reloadAccounting();
    if(oldReload===false)throw new Error('Original Accounting data reload was rejected.');
    const oldRefresh=await appBridge.refreshAccountingViews();
    if(oldRefresh===false)throw new Error('Original Accounting views did not refresh.');
    storage.removeItem(result.recoveryKey);
    if(storage.getItem(result.recoveryKey)!==null)throw new Error('Recovery snapshot cleanup failed.');
    throw new Error('App refresh failed; previous Accounting data and views were restored. '+String(refreshError&&refreshError.message||refreshError));
   }catch(rollbackError){
    if(rollbackError&&String(rollbackError.message||rollbackError).startsWith('App refresh failed; previous Accounting data and views were restored.'))throw rollbackError;
    throw new Error('CRITICAL: App refresh failed and rollback could not be fully verified. Keep '+result.recoveryKey+' and do not clear browser storage. Original refresh error: '+String(refreshError&&refreshError.message||refreshError)+'. Rollback error: '+String(rollbackError&&rollbackError.message||rollbackError));
   }
  }
 }
 root.HandymanAccountingBackupV7Adapter=Object.freeze({restoreAndRefresh});
})(typeof window!=='undefined'?window:globalThis);
