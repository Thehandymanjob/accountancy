/* The Handyman Accountancy v250 — application storage adapter.
   This module is intentionally NOT loaded by index.html yet.
   It contains no LocalStorage access and performs no business-data writes during initialize().
   Typed writes are explicit API calls made by the future async application call sites.
*/
(function(root){
 "use strict";
 const DATABASE="the_handyman_accountancy_v250_idb";
 const DOMAINS=Object.freeze({
  accounting:"accounting",
  projects:"projects",
  contracts:"contracts",
  settings:"settings",
  reports:"reports",
  diagnostics:"diagnostics",
  counters:"counters",
  legacy:"legacy"
 });
 const BUSINESS_TARGETS=Object.freeze([
  {domain:DOMAINS.accounting,key:"main"},
  {domain:DOMAINS.projects,key:"main"},
  {domain:DOMAINS.contracts,key:"main"}
 ]);
 const REPORT_KEYS=Object.freeze({
  archive:"tha_test226_report_archive_v1",
  notifications:"tha_test226_report_notifications_v1",
  settings:"tha_test226_report_settings_v1",
  workflow:"tha_test226_report_workflow_v1",
  emailSettings:"tha_test226_report_email_settings_v1"
 });
 const LEGACY_KEY_MAP=Object.freeze({
  accounting:"tha_test226_accounting_v1",
  projects:"tha_test226_projects_v1",
  contracts:"tha_test226_contracts_v1",
  invoiceSequence:"tha_test226_invoice_sequence_v1",
  isolationCleanup:"tha_test226_isolation_test_record_cleanup_v1",
  invoiceSequenceCleanup:"tha_test226_invoice_sequence_cleanup_v1",
  emptySequenceReset:"tha_test226_empty_invoice_sequence_reset_v229",
  factoryResetRecovery:"tha_test226_factory_reset_recovery_v1",
  monitorLog:"tha_test226_monitor_log_v1",
  language:"tha_test226_app_language_v1",
  languagePreferenceVersion:"tha_test226_app_language_pref_version_v1"
 });
 const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
 const allowed=new Set(Object.values(DOMAINS).filter(x=>x!=="legacy"));
 let initialized=false;
 let initPromise=null;
 let lastHealth=null;
 function repository(){
  const api=root.HandymanStorageRepository;
  if(!api||api.databaseName!==DATABASE)throw new Error("The verified v250 IndexedDB repository is not loaded.");
  return api;
 }
 function validateDomainKey(domain,key){
  if(!allowed.has(domain))throw new Error("Unknown or protected storage domain: "+domain);
  if(typeof key!=="string"||!key||key.length>512)throw new Error("Invalid IndexedDB record key.");
 }
 function validateBusinessPayload(kind,value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(kind+" payload must be an object.");
  if(kind==="accounting"){
   for(const field of ["entries","customers","invoices"])if(!Array.isArray(value[field]))throw new Error("Accounting payload is missing its "+field+" array.");
   if(!value.settings||typeof value.settings!=="object"||Array.isArray(value.settings))throw new Error("Accounting payload settings are missing or invalid.");
  }
  if(kind==="projects"){
   for(const field of ["projects","workers","partners","contractors","companies","companyJobs"])
    if(!Array.isArray(value[field]))throw new Error("Projects payload is missing its "+field+" array.");
  }
 }
 async function initialize(){
  if(initialized)return {ok:true,database:DATABASE,readOnly:true,health:clone(lastHealth)};
  if(initPromise)return initPromise;
  initPromise=(async()=>{
   const api=repository();
   const ready=await api.ready();
   if(!ready||ready.ok!==true||ready.database!==DATABASE)throw new Error("v250 IndexedDB repository did not become ready.");
   const health=await api.health();
   if(!health||health.ok!==true||health.database!==DATABASE)throw new Error("v250 IndexedDB health check failed.");
   // Initialization is deliberately read-only for business data.
   const records=await api.readMany(BUSINESS_TARGETS);
   if(!records||records.ok!==true||!Array.isArray(records.records)||records.records.length!==3)
    throw new Error("Could not read all three v250 business-domain records.");
   lastHealth=health;
   initialized=true;
   return {
    ok:true,database:DATABASE,readOnly:true,
    typedRecords:records.records.map(x=>({domain:x.domain,key:x.key,present:x.value!==null})),
    health:clone(health),
    localStorageAccessed:false,
    businessDataWritten:false,
    appCutover:false
   };
  })().catch(error=>{initialized=false;throw error}).finally(()=>{initPromise=null});
  return initPromise;
 }
 async function requireReady(){
  if(!initialized)await initialize();
  return repository();
 }
 async function load(domain,key){
  validateDomainKey(domain,key);
  const api=await requireReady();
  return api.get(domain,key);
 }
 async function save(domain,key,value){
  validateDomainKey(domain,key);
  const api=await requireReady();
  return api.put(domain,key,clone(value));
 }
 async function loadAccounting(){return load(DOMAINS.accounting,"main");}
 async function saveAccounting(value){validateBusinessPayload("accounting",value);return save(DOMAINS.accounting,"main",value);}
 async function loadProjects(){return load(DOMAINS.projects,"main");}
 async function saveProjects(value){validateBusinessPayload("projects",value);return save(DOMAINS.projects,"main",value);}
 async function loadContracts(){return load(DOMAINS.contracts,"main");}
 async function saveContracts(value){
  if(!Array.isArray(value))throw new Error("Contracts payload must be an array.");
  return save(DOMAINS.contracts,"main",value);
 }
 async function loadSetting(key){return load(DOMAINS.settings,key);}
 async function saveSetting(key,value){return save(DOMAINS.settings,key,value);}
 async function loadReport(name){
  if(!Object.prototype.hasOwnProperty.call(REPORT_KEYS,name))throw new Error("Unknown report storage key: "+name);
  return load(DOMAINS.reports,name);
 }
 async function saveReport(name,value){
  if(!Object.prototype.hasOwnProperty.call(REPORT_KEYS,name))throw new Error("Unknown report storage key: "+name);
  return save(DOMAINS.reports,name,value);
 }
 async function loadDiagnostic(key){return load(DOMAINS.diagnostics,key);}
 async function saveDiagnostic(key,value){return save(DOMAINS.diagnostics,key,value);}
 async function snapshot(domains){
  const api=await requireReady();
  const selected=domains===undefined?Object.values(DOMAINS):domains;
  if(!Array.isArray(selected)||selected.includes("legacy")===false)
   throw new Error("A full safety snapshot must explicitly include the preserved legacy domain.");
  return api.snapshot(selected);
 }
 async function mutateNumberedAccounting(change){
  if(typeof change!=="function")throw new Error("A synchronous accounting change callback is required.");
  const api=await requireReady();
  const descriptors=[
   {domain:DOMAINS.accounting,key:"main",initialValue:null},
   {domain:DOMAINS.counters,key:"shared-record-number",initialValue:0}
  ];
  const result=await api.mutateMany(descriptors,current=>{
   const accounting=current[0].value;
   if(!accounting)throw new Error("Accounting data has not been imported; refusing to create a blank accounting database.");
   validateBusinessPayload("accounting",accounting);
   const used=[
    ...accounting.invoices.map(x=>Number(x&&x.number)||0),
    ...accounting.entries.filter(x=>x&&x.type==="income").map(x=>Number(x&&x.number)||0)
   ];
   const highWater=Math.max(Number(current[1].value)||0,...used,0);
   const nextNumber=highWater+1;
   const nextAccounting=change(clone(accounting),nextNumber);
   validateBusinessPayload("accounting",nextAccounting);
   return [nextAccounting,nextNumber];
  });
  if(!result||result.ok!==true||!Array.isArray(result.records)||result.records.length!==2)
   throw new Error("Atomic numbered accounting mutation did not complete.");
  return {ok:true,accounting:clone(result.records[0].value),number:result.records[1].value,atomic:true};
 }
 async function status(){
  const api=await requireReady();
  lastHealth=await api.health();
  return {ok:true,initialized,database:DATABASE,health:clone(lastHealth),localStorageAccessed:false,appCutover:false};
 }
 root.HandymanV250AppStorage=Object.freeze({
  databaseName:DATABASE,domains:DOMAINS,reportKeys:REPORT_KEYS,legacyKeyMap:LEGACY_KEY_MAP,
  initialize,load,save,loadAccounting,saveAccounting,loadProjects,saveProjects,
  loadContracts,saveContracts,loadSetting,saveSetting,loadReport,saveReport,
  loadDiagnostic,saveDiagnostic,snapshot,mutateNumberedAccounting,status
 });
})(window);
