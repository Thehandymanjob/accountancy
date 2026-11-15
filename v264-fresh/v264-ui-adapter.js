/* THA v264 UI integration adapter — async-only facade for the preserved v262 interface.
   This module does not render or restyle UI. It provides explicit async actions
   for a later UI cutover and never accesses LocalStorage, SessionStorage or legacy data.
*/
(function(root){
 "use strict";
 const BUILD="THA-264-UI-ADAPTER-1";
 const required=(name)=>{const api=root[name];if(!api)throw new Error("Required v264 module is not loaded: "+name);return api;};
 const clone=value=>root.structuredClone(value);
 const boot=()=>required("HandymanModuleBootstrapV264");
 async function startAll(){
  const names=["startAccounting","startProjects","startContracts","startBusinessProfile","startSupport"];
  const results={};const errors={};
  await Promise.all(names.map(async name=>{try{results[name]=await boot()[name]();}catch(error){errors[name]=String(error&&error.message||error);}}));
  const ok=Object.keys(errors).length===0;
  return {ok,build:BUILD,mode:"indexeddb-only",legacyImport:false,productionTouched:false,modules:results,errors};
 }
 const accounting=()=>required("HandymanAccountingV264");
 const invoices=()=>required("HandymanInvoiceWorkflowV264");
 const projects=()=>required("HandymanProjectsV264");
 const contracts=()=>required("HandymanContractsV264");
 const profile=()=>required("HandymanBusinessProfileV264");
 const support=()=>required("HandymanSupportV264");
 const media=()=>required("HandymanMediaV264");
 async function setProjectCompletion(projectId,complete){
  if(typeof complete!=="boolean")throw new Error("Completion state must be an explicit boolean.");
  return projects().updateProject(projectId,{status:complete?"complete":"open"});
 }
 async function saveInvoice(invoice,payment,customer){
  if(payment&&Number(payment.amount)!==Number(invoices().total(invoice)))throw new Error("Partial invoice payments are not supported by the current v264 invoice workflow. No invoice was saved.");
  return invoices().saveInvoice(invoice,payment,customer);
 }
 async function loadAll(){
  const names=["accounting","projects","contracts","businessProfile","support"];
  const results={};const errors={};
  await Promise.all(names.map(async name=>{try{results[name]=await boot()["start"+name[0].toUpperCase()+name.slice(1)]();}catch(e){errors[name]=String(e&&e.message||e);}}));
  return {ok:Object.keys(errors).length===0,modules:results,errors};
 }
 const api=Object.freeze({
  build:BUILD,mode:"indexeddb-only",startAll,loadAll,
  accounting:Object.freeze({load:()=>accounting().load(),save:value=>accounting().save(value),update:fn=>accounting().update(fn),addEntry:item=>accounting().addEntry(item),updateEntry:(id,patch)=>accounting().updateEntry(id,patch),deleteEntry:id=>accounting().deleteEntry(id),saveCustomer:item=>accounting().saveCustomer(item),deleteCustomer:id=>accounting().deleteCustomer(id),reserveInvoiceNumber:min=>accounting().reserveInvoiceNumber(min)}),
  invoices:Object.freeze({total:item=>invoices().total(item),save:(item,payment,customer)=>saveInvoice(item,payment,customer),markPaid:(id,payment)=>invoices().markPaid(id,payment),markUnpaid:id=>invoices().markUnpaid(id),softDelete:id=>invoices().softDelete(id)}),
  projects:Object.freeze({load:()=>projects().load(),save:value=>projects().save(value),update:fn=>projects().update(fn),add:item=>projects().addProject(item),updateProject:(id,patch)=>projects().updateProject(id,patch),remove:id=>projects().deleteProject(id),addSubproject:(id,item)=>projects().addSubproject(id,item),updateSubproject:(id,subId,patch)=>projects().updateSubproject(id,subId,patch),removeSubproject:(id,subId)=>projects().deleteSubproject(id,subId),saveDirectory:(kind,item)=>projects().saveDirectory(kind,item),deleteDirectory:(kind,id)=>projects().deleteDirectory(kind,id),saveLedgerRecord:(projectId,subprojectId,collection,item)=>projects().saveLedgerRecord(projectId,subprojectId,collection,item),deleteLedgerRecord:(projectId,subprojectId,collection,id)=>projects().deleteLedgerRecord(projectId,subprojectId,collection,id),setComplete:setProjectCompletion}),
  contracts:Object.freeze({load:()=>contracts().load(),save:value=>contracts().save(value),add:item=>contracts().add(item),update:(id,patch)=>contracts().updateContract(id,patch),remove:id=>contracts().remove(id),get:id=>contracts().get(id)}),
  businessProfile:Object.freeze({load:()=>profile().load(),save:value=>profile().save(value),update:patch=>profile().update(patch),backup:()=>profile().backup(),restore:pkg=>profile().restore(pkg)}),
  support:Object.freeze({load:name=>support().load(name),save:(name,value)=>support().save(name,value),update:(name,fn)=>support().update(name,fn),setLanguage:(lang,version)=>support().setLanguage(lang,version),appendDiagnostic:event=>support().appendDiagnostic(event),loadReportWorkspace:()=>support().loadReportWorkspace(),saveReportWorkspace:value=>support().saveReportWorkspace(value),saveHelpContactDraft:draft=>support().saveHelpContactDraft(draft),deleteHelpContactDraft:id=>support().deleteHelpContactDraft(id)}),
  media:Object.freeze({initialize:()=>media().initialize(),saveAsset:item=>media().saveAsset(item),getAsset:id=>media().getAsset(id),deleteAsset:id=>media().deleteAsset(id),list:filter=>media().list(filter)}),
  health:()=>required("HandymanStorageV264").health(),
  backup:scopeName=>required("HandymanRecoveryV264").create(scopeName)
 });
 root.HandymanUIAdapterV264=api;
})(window);
