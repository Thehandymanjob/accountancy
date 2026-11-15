/* THA v264 application startup coordinator.
   Deliberately not auto-invoked by the legacy UI. This coordinator is the
   fail-closed entry point for the eventual IndexedDB-only cutover.
   It never reads LocalStorage, SessionStorage, cookies or legacy data.
*/
(function(root){
 "use strict";
 const BUILD="THA-264-APP-STARTUP-1";
 const MODULES=[
  ["storage","HandymanStorageV264","ready"],
  ["domainBoundary","HandymanV264DomainBoundary","createScope"],
  ["appStorage","HandymanAppStorageV264","initialize"],
  ["accounting","HandymanAccountingV264","load"],
  ["invoices","HandymanInvoiceWorkflowV264","saveInvoice"],
  ["projects","HandymanProjectsV264","load"],
  ["contracts","HandymanContractsV264","load"],
  ["businessProfile","HandymanBusinessProfileV264","load"],
  ["support","HandymanSupportV264","load"],
  ["recovery","HandymanRecoveryV264","create"],
  ["moduleBootstrap","HandymanModuleBootstrapV264","startAccounting"],
  ["moduleBootstrapProjects","HandymanModuleBootstrapV264","startProjects"],
  ["moduleBootstrapContracts","HandymanModuleBootstrapV264","startContracts"],
  ["moduleBootstrapBusinessProfile","HandymanModuleBootstrapV264","startBusinessProfile"],
  ["moduleBootstrapSupport","HandymanModuleBootstrapV264","startSupport"],
  ["uiAdapter","HandymanUIAdapterV264","startAll"]
 ];
 let active=null;
 const get=(name)=>root[name];
 function verifyModules(){
  const missing=[];
  for(const [label,globalName,method] of MODULES){
   const api=get(globalName);
   if(!api||typeof api[method]!=="function")missing.push(label+":"+globalName+"."+method);
  }
  if(missing.length)throw new Error("Required v264 modules are missing: "+missing.join(", "));
  return true;
 }
 async function start(){
  if(active)return active;
  active=(async()=>{
   const startedAt=new Date().toISOString();
   verifyModules();
   const engine=root.HandymanStorageV264;
   const ready=await engine.ready();
   if(!ready||ready.ok!==true||ready.mode!=="indexeddb-only"||ready.legacyImport!==false)
    throw new Error("IndexedDB engine did not confirm an IndexedDB-only ready state.");
   const health=await engine.health();
   if(!health||health.ok!==true||health.database!==engine.databaseName)
    throw new Error("IndexedDB health check failed. UI activation is blocked.");
   if(health.resetLocked)throw new Error("Database recovery is locked. Restore the verified backup before continuing.");
   const appStorage=await root.HandymanAppStorageV264.initialize();
   if(!appStorage||appStorage.ok!==true||appStorage.mode!=="indexeddb-only"||appStorage.legacyImport!==false)
    throw new Error("Application storage did not confirm the clean v264 storage policy.");
   const boot=await root.HandymanUIAdapterV264.startAll();
   if(!boot||boot.ok!==true)throw new Error("One or more application domains failed to initialize.");
   const finalHealth=await engine.health();
   if(!finalHealth||finalHealth.ok!==true||finalHealth.database!==engine.databaseName)
    throw new Error("Final IndexedDB health verification failed.");
   return Object.freeze({
    ok:true,ready:true,build:BUILD,database:finalHealth.database,
    mode:"indexeddb-only",legacyImport:false,productionTouched:false,
    startedAt,health:finalHealth,modules:boot.modules,
    uiActivation:"BLOCKED_PENDING_ASYNC_UI_MIGRATION"
   });
  })().catch(error=>{active=null;throw error;});
  return active;
 }
 function status(){return {build:BUILD,started:!!active,uiActivation:"BLOCKED_PENDING_ASYNC_UI_MIGRATION"};}
 root.HandymanV264AppStartup=Object.freeze({build:BUILD,start,verifyModules,status});
})(window);
