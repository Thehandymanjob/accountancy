/* THA v264 independent module bootstraps.
   Each entry point loads exactly one application domain. A failure in one module
   cannot prevent another module from starting. No cross-domain data is aggregated.
*/
(function(root){
 "use strict";
 const BUILD="THA-264-INDEPENDENT-BOOTSTRAPS-1";
 const pending=Object.create(null),ready=Object.create(null);
 function requireApi(name,method){
  const api=root[name];
  if(!api||typeof api[method]!=="function")throw new Error("Required v264 module is unavailable: "+name+"."+method);
  return api;
 }
 async function start(name){
  if(ready[name])return ready[name];
  if(pending[name])return pending[name];
  pending[name]=(async()=>{
   const engine=requireApi("HandymanStorageV264","ready");
   const storage=requireApi("HandymanAppStorageV264","initialize");
   const initialized=await storage.initialize();
   if(!initialized||initialized.ok!==true||initialized.mode!=="indexeddb-only"||initialized.legacyImport!==false)
    throw new Error("v264 storage initialization did not meet the clean-database policy.");
   const health=await engine.health();
   if(!health||health.ok!==true||health.database!==engine.databaseName)throw new Error("v264 database health check failed.");
   if(health.resetLocked)throw new Error("Database recovery is incomplete. Restore the full verified backup before opening application modules.");
   let state,capabilities={};
   if(name==="accounting"){
    state=await requireApi("HandymanAccountingV264","load").load();
    requireApi("HandymanInvoiceWorkflowV264","saveInvoice");
    requireApi("HandymanRecoveryV264","create");
    capabilities={accounting:true,invoiceWorkflow:true,recovery:true};
   }else if(name==="projects"){
    state=await requireApi("HandymanProjectsV264","load").load();capabilities={projects:true};
   }else if(name==="contracts"){
    state=await requireApi("HandymanContractsV264","load").load();capabilities={contracts:true};
   }else if(name==="businessProfile"){
    state=await requireApi("HandymanBusinessProfileV264","load").load();capabilities={businessProfile:true};
   }else if(name==="support"){
    const support=requireApi("HandymanSupportV264","load");
    const names=["preferences","preferenceMeta","diagnostics","reports","reportNotifications","reportSettings","reportWorkflow","notifications","recovery","factoryResetRecovery","helpContactDrafts"];
    const values=await Promise.all(names.map(domain=>support.load(domain)));
    state={};names.forEach((domain,index)=>state[domain]=values[index]);capabilities={support:true};
   }else throw new Error("Unknown v264 module bootstrap: "+name);
   const result=Object.freeze({ok:true,ready:true,module:name,build:BUILD,database:health.database,mode:"indexeddb-only",legacyImport:false,productionTouched:false,health,state,capabilities});
   ready[name]=result;return result;
  })().catch(error=>{delete pending[name];delete ready[name];throw error;});
  return pending[name];
 }
 function isReady(name){return !!ready[name];}
 function getState(name){if(!ready[name])throw new Error("v264 "+name+" bootstrap has not completed.");return ready[name].state;}
 const api=Object.freeze({build:BUILD,startAccounting:()=>start("accounting"),startProjects:()=>start("projects"),startContracts:()=>start("contracts"),startBusinessProfile:()=>start("businessProfile"),startSupport:()=>start("support"),isReady,getState});
 root.HandymanModuleBootstrapV264=api;
 root.HandymanBootstrapV264=Object.freeze({build:BUILD,start:api.startAccounting,isReady:()=>isReady("accounting"),getState:()=>{if(!isReady("accounting"))throw new Error("v264 accounting bootstrap has not completed.");return ready.accounting;}});
})(window);
