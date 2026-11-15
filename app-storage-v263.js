/* THA v263 application repository adapter — strict domain boundary edition.
   All application reads/writes pass through HandymanV263DomainBoundary.
   No cross-domain transactions, mixed backups, LocalStorage, or legacy import.
*/
(function(root){
 "use strict";
 const boundary=()=>{const api=root.HandymanV263DomainBoundary;if(!api)throw new Error("v263 strict domain boundary is not loaded.");return api;};
 const domains=Object.freeze({
  accounting:{domain:"accounting",key:"state",scope:"accounting",fallback:()=>({entries:[],customers:[],invoices:[],customExpenseCategories:[],settings:{businessName:"",ownerName:""}})},
  projects:{domain:"projects",key:"state",scope:"projects",fallback:()=>({projects:[],workers:[],partners:[],contractors:[],companies:[],companyJobs:[],current:null,guide:"en"})},
  contracts:{domain:"contracts",key:"state",scope:"contracts",fallback:()=>({contracts:[]})},
  businessProfile:{domain:"business_profile",key:"identity",scope:"businessProfile",fallback:()=>({businessName:"",ownerName:"",phone:"",email:"",address:"",logo:"",paymentDetails:""})},
  sequences:{domain:"sequences",key:"invoice-number",scope:"accounting",fallback:()=>0},
  preferences:{domain:"preferences",key:"language",scope:"support",fallback:()=>"en"},
  preferenceMeta:{domain:"preference_meta",key:"language-pref-version",scope:"support",fallback:()=>""},
  diagnostics:{domain:"diagnostics",key:"monitor-log",scope:"support",fallback:()=>[]},
  reports:{domain:"reports",key:"archive",scope:"support",fallback:()=>[]},
  reportNotifications:{domain:"report_notifications",key:"notifications",scope:"support",fallback:()=>[]},
  reportSettings:{domain:"report_settings",key:"settings",scope:"support",fallback:()=>({})},
  reportWorkflow:{domain:"report_workflow",key:"workflow",scope:"support",fallback:()=>({})},
  notifications:{domain:"notifications",key:"items",scope:"support",fallback:()=>[]},
  recovery:{domain:"recovery",key:"last-reset-snapshot",scope:"support",fallback:()=>null},
  factoryResetRecovery:{domain:"factory_reset_recovery",key:"factory-reset-recovery",scope:"support",fallback:()=>null}
 });
 const scopeNames=Object.freeze({accounting:"accounting",accountingState:"accountingState",invoiceSequence:"invoiceSequence",projects:"projects",contracts:"contracts",businessProfile:"businessProfile",support:"support"});
 const descriptor=name=>{const item=domains[name];if(!item)throw new Error("Unknown application storage domain: "+name);return item;};
 const scoped=name=>boundary().createScope(scopeNames[name]);
 async function initialize(){
  const e=root.HandymanStorageV263;if(!e)throw new Error("v263 IndexedDB engine is not loaded.");
  const status=await e.ready();if(!status||status.ok!==true)throw new Error("v263 IndexedDB initialization did not pass.");
  for(const name of Object.keys(scopeNames))scoped(name);
  return {ok:true,database:status.database,build:status.build,mode:"indexeddb-only",legacyImport:false,strictDomainBoundary:true};
 }
 async function read(name){
  const d=descriptor(name),value=await scoped(d.scope).get(d.domain,d.key);
  return value===null?d.fallback():value;
 }
 async function readAll(){
  await initialize();const state={};
  for(const name of Object.keys(domains))state[name]=await read(name);
  return {ok:true,emptyDatabase:Object.keys(state).every(name=>{const d=domains[name];return JSON.stringify(state[name])===JSON.stringify(d.fallback());}),state};
 }
 async function write(name,value){
  const d=descriptor(name),result=await scoped(d.scope).put(d.domain,d.key,value);
  if(!result||result.ok!==true)throw new Error("IndexedDB write was not confirmed: "+name);
  const verified=await scoped(d.scope).get(d.domain,d.key);
  if(!(await root.HandymanStorageV263.valuesEqual(verified,value)))throw new Error("IndexedDB write verification failed: "+name);
  return {...result,verified:true};
 }
 async function mutate(name,updater){
  if(typeof updater!=="function")throw new Error("A synchronous state updater is required.");
  const d=descriptor(name),result=await scoped(d.scope).mutate(d.domain,d.key,d.fallback(),updater);
  if(!result||result.ok!==true)throw new Error("IndexedDB mutation was not confirmed: "+name);
  return {ok:true,state:result.records?result.records[0].value:result.state,updatedAt:result.updatedAt};
 }
 async function writeMany(){throw new Error("Multi-domain writes are disabled. Save one independent domain at a time.");}
 async function reserveInvoiceNumber(minimum){return scoped("accounting").reserveCounter("sequences","invoice-number",minimum||0);}
 async function backup(name){
  if(!domains[name])throw new Error("A single application domain name is required for backup.");
  const d=descriptor(name);const backupScope=d.domain==="sequences"?"invoiceSequence":d.scope==="accounting"?"accountingState":d.scope;return scoped(backupScope).snapshot();
 }
 async function restore(name,pkg){
  if(!domains[name])throw new Error("A single application domain name is required for restore.");
  if(!pkg||!Array.isArray(pkg.domains))throw new Error("Invalid scoped backup package.");
  const d=descriptor(name);
  if(pkg.domains.length!==1||pkg.domains[0]!==d.domain)throw new Error("Backup does not belong to the selected domain.");
  const backupScope=d.domain==="sequences"?"invoiceSequence":d.scope==="accounting"?"accountingState":d.scope;
  return scoped(backupScope).restore(pkg);
 }
 async function health(){return root.HandymanStorageV263.health();}
 root.HandymanAppStorageV263=Object.freeze({
  domains:Object.keys(domains),initialize,read,readAll,write,writeMany,mutate,
  reserveInvoiceNumber,backup,restore,health
 });
})(window);
