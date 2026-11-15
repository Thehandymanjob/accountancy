/* THA v264: opt-in, non-destructive accounting UI startup gate.
   The legacy index is NOT wired to this module until all synchronous
   accounting write paths have been migrated. No LocalStorage access. */
(function(root){
 "use strict";
 let state="idle",promise=null,lastError=null;
 function requireBridge(){
  const bridge=root.HandymanAccountingUIBridgeV264;
  if(!bridge||typeof bridge.initialize!=="function"||typeof bridge.load!=="function")
   throw new Error("The v264 IndexedDB accounting UI bridge is missing.");
  return bridge;
 }
 async function start(options){
  if(state==="ready")return {ok:true,mode:"indexeddb-only",state:await requireBridge().load()};
  if(promise)return promise;
  const opts=options||{};
  if(opts.onReady!==undefined&&typeof opts.onReady!=="function")throw new TypeError("onReady must be a function.");
  if(opts.onError!==undefined&&typeof opts.onError!=="function")throw new TypeError("onError must be a function.");
  state="loading";lastError=null;
  promise=(async()=>{
   try{
    const bridge=requireBridge();
    const initialized=await bridge.initialize();
    if(!initialized||initialized.ok!==true)throw new Error("IndexedDB accounting initialization was not verified.");
    const snapshot=await bridge.load();
    if(!snapshot||!Array.isArray(snapshot.entries)||!Array.isArray(snapshot.customers)||!Array.isArray(snapshot.invoices))
     throw new Error("IndexedDB accounting snapshot is invalid.");
    if(opts.onReady)await opts.onReady(snapshot);
    state="ready";
    return {ok:true,mode:"indexeddb-only",state:snapshot};
   }catch(error){
    lastError=error;state="failed";
    if(opts.onError)try{opts.onError(error);}catch(callbackError){root.console?.error?.(callbackError);}
    throw error;
   }finally{promise=null;}
  })();
  return promise;
 }
 root.HandymanAccountingUIStartupV264=Object.freeze({
  start,
  get status(){return state;},
  get error(){return lastError?String(lastError.message||lastError):null;},
  get ready(){return state==="ready";}
 });
})(window);
