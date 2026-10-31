/* Adapter for the actual HandymanBackupV7 module. Not loaded by index.html. */
(function(root){
 'use strict';
 function writeRaw(storage,key,raw){
  if(raw===null)storage.removeItem(key);else storage.setItem(key,raw);
  if(storage.getItem(key)!==raw)throw new Error('Recovery read-back failed: '+key);
 }
 async function restoreAndRefresh(payload,storage,confirmFn,bridge){
  const api=root.HandymanBackupV7;
  if(!api||typeof api.restoreBackup!=='function')throw new Error('Main Backup v7 module is not loaded.');
  if(!bridge||typeof bridge.reloadAccounting!=='function'||typeof bridge.refreshAccountingViews!=='function')throw new Error('Accounting bridge is incomplete.');
  const result=await api.restoreBackup(payload,storage,confirmFn);
  if(!result||result.restored!==true)return result||{restored:false,reason:'cancelled'};
  try{
   const loaded=await bridge.reloadAccounting();
   if(loaded===false)throw new Error('Restored Accounting reload failed.');
   const refreshed=await bridge.refreshAccountingViews();
   if(refreshed===false)throw new Error('Restored Accounting views did not refresh.');
   return Object.assign({},result,{appRefreshed:true,recoveryRetained:true});
  }catch(refreshError){
   let snapshot;
   try{
    const raw=storage.getItem(result.recoveryKey);
    if(!raw)throw new Error('Recovery snapshot is missing.');
    snapshot=JSON.parse(raw);
    if(snapshot.schema!==2||snapshot.scope!=='accounting-only'||!snapshot.keys||typeof snapshot.keys!=='object')throw new Error('Recovery snapshot structure is invalid.');
    for(const key of Object.keys(snapshot.keys))writeRaw(storage,key,snapshot.keys[key]);
    for(const key of Object.keys(snapshot.keys))if(storage.getItem(key)!==snapshot.keys[key])throw new Error('Rollback verification failed: '+key);
    const loadedOld=await bridge.reloadAccounting();
    if(loadedOld===false)throw new Error('Original Accounting reload failed.');
    const refreshedOld=await bridge.refreshAccountingViews();
    if(refreshedOld===false)throw new Error('Original Accounting views did not refresh.');
    storage.removeItem(result.recoveryKey);
    if(storage.getItem(result.recoveryKey)!==null)throw new Error('Recovery cleanup failed.');
    throw new Error('App refresh failed; previous Accounting data and views were restored. '+String(refreshError&&refreshError.message||refreshError));
   }catch(rollbackError){
    if(String(rollbackError&&rollbackError.message||rollbackError).startsWith('App refresh failed; previous Accounting data and views were restored.'))throw rollbackError;
    throw new Error('CRITICAL: App refresh failed and rollback could not be verified. Preserve '+result.recoveryKey+'. '+String(rollbackError&&rollbackError.message||rollbackError));
   }
  }
 }
 root.HandymanBackupV7Adapter=Object.freeze({restoreAndRefresh});
})(typeof window!=='undefined'?window:globalThis);
