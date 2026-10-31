/* The Handyman Accountancy — opt-in Accounting app bridge for Backup v7.
 * Must be loaded AFTER index.html's main classic script.
 * Not referenced by index.html; no production integration is performed here.
 * Scope is strictly the Accounting DB and Accounting views.
 */
(function(root){
 'use strict';
 function create(){
  // These identifiers are declared by the app's main classic script.
  // Resolve them only when the bridge is explicitly created and invoked.
  function validDb(value){
   return !!value && typeof value==='object' && !Array.isArray(value) &&
    Array.isArray(value.entries) && Array.isArray(value.customers) &&
    Array.isArray(value.invoices) && !!value.settings &&
    typeof value.settings==='object' && !Array.isArray(value.settings);
  }
  function reloadAccounting(){
   if(typeof loadDB!=='function')throw new Error('App loadDB() is unavailable.');
   loadDB();
   if(typeof accountingDataIntegrityError!=='undefined' && accountingDataIntegrityError)
    throw new Error('App rejected Accounting data because its integrity check failed.');
   if(typeof storageAvailable!=='undefined' && !storageAvailable)
    throw new Error('App Accounting storage is unavailable after reload.');
   if(!validDb(db))throw new Error('App Accounting DB failed structural verification.');
   return true;
  }
  function refreshAccountingViews(){
   if(!validDb(db))throw new Error('In-memory Accounting DB is invalid; views were not refreshed.');
   if(typeof refreshAll!=='function')throw new Error('App refreshAll() is unavailable.');
   refreshAll();
   return true;
  }
  return Object.freeze({reloadAccounting,refreshAccountingViews});
 }
 root.HandymanBackupV7AppBridge=Object.freeze({create});
})(typeof window!=='undefined'?window:globalThis);
