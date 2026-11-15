/* THA v273 full legacy backup conversion + guarded IndexedDB factory reset.
   Runs only on explicit user action. No LocalStorage access.
*/
(function(root){
"use strict";
const DB="the_handyman_accountancy_v264_idb";
const FORMAT="tha-v264-indexeddb-snapshot-v1";
const SOURCE_SHA="07b6170db9169e3b59d0b4527b88e26d589bd18c178ec9a1b1975b55f403db90";
const DOMAINS=["accounting","business_profile","contracts","diagnostics","factory_reset_recovery","help_contact_drafts","media","notifications","preference_meta","preferences","projects","recovery","report_notifications","report_settings","report_workflow","reports","sequences"];
const REQUIRED=["accounting:state","business_profile:identity","contracts:state","projects:state","sequences:invoice-number","preferences:language","preference_meta:language-pref-version","diagnostics:monitor-log","reports:archive","report_notifications:notifications","report_settings:settings","report_workflow:workflow","notifications:items","recovery:last-reset-snapshot","factory_reset_recovery:factory-reset-recovery","help_contact_drafts:drafts","media:assets"];
const $=id=>root.document.getElementById(id);
const assert=(v,m)=>{if(!v)throw new Error(m);};
const engine=()=>{const e=root.HandymanStorageV264;if(!e)throw new Error("IndexedDB engine is unavailable.");return e;};
const row=(domain,key,value)=>({id:domain+":"+key,domain,key,value});
function setStatus(message,error){const el=$("factoryResetStatus");if(el){el.textContent=message;el.style.color=error?"#9b2634":"#205a30";}}
async function digest(buffer){const hash=await root.crypto.subtle.digest("SHA-256",buffer);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function unique(items,label){assert(Array.isArray(items),label+" must be an array.");const ids=items.map(x=>x&&x.id);assert(ids.every(x=>typeof x==="string"&&x.length>0),label+" contains a missing ID.");assert(new Set(ids).size===ids.length,label+" contains duplicate IDs.");}
async function convertLegacy(file){
 assert(file&&file.size>0,"Choose the original backup JSON.");
 const bytes=await file.arrayBuffer();
 assert(await digest(bytes)===SOURCE_SHA,"The selected file is not the approved New_new(2).json backup. Conversion stopped.");
 const source=JSON.parse(new TextDecoder().decode(bytes));
 assert(source.app==="The Handyman Accountancy"&&source.backupType==="complete-user-data"&&source.version===6,"Unsupported legacy backup.");
 assert(source.data&&source.projects&&Array.isArray(source.contracts),"Required backup sections are missing.");
 const a=source.data,p=source.projects;
 assert(Array.isArray(a.entries)&&Array.isArray(a.customers)&&Array.isArray(a.invoices),"Accounting arrays are missing.");
 assert(Array.isArray(p.projects)&&Array.isArray(p.workers),"Project arrays are missing.");
 unique(a.entries,"Accounting entries");unique(a.customers,"Customers");unique(a.invoices,"Invoices");unique(p.projects,"Projects");unique(p.workers,"Workers");
 for(const project of p.projects)unique(project.subprojects||[],"Subprojects");
 const profile=p.profile||{},projects={...p};delete projects.profile;
 const businessProfile={businessName:String(profile.businessName||""),ownerName:String(profile.ownerName||""),phone:String(profile.phone||""),email:String(profile.email||""),address:String(profile.address||""),logo:String(profile.logo||""),paymentDetails:String(profile.paymentDetails||"")};
 const maxInvoice=Math.max(140,...a.invoices.map(x=>Number(x.number)||0),...a.entries.map(x=>Number(x.invoiceNumber)||0));
 const pkg={format:FORMAT,database:DB,sourceSha256:SOURCE_SHA,createdAt:new Date().toISOString(),domains:DOMAINS.slice(),records:[
 row("accounting","state",a),row("business_profile","identity",businessProfile),row("contracts","state",{contracts:source.contracts}),row("projects","state",projects),row("sequences","invoice-number",maxInvoice),
 row("preferences","language","en"),row("preference_meta","language-pref-version",""),row("diagnostics","monitor-log",[]),row("reports","archive",[]),row("report_notifications","notifications",[]),row("report_settings","settings",{}),row("report_workflow","workflow",{}),row("notifications","items",[]),row("recovery","last-reset-snapshot",null),row("factory_reset_recovery","factory-reset-recovery",null),row("help_contact_drafts","drafts",[]),row("media","assets",{items:[]})
 ]};
 assert(pkg.records.length===17,"Expected 17 records.");
 assert(JSON.stringify(pkg.domains)===JSON.stringify([...pkg.domains].sort()),"Domain list is not canonical.");
 assert(pkg.records.every(x=>x.id===x.domain+":"+x.key&&DOMAINS.includes(x.domain)),"Record identity validation failed.");
 const serialized=JSON.stringify(pkg);assert(JSON.stringify(JSON.parse(serialized))===serialized,"JSON round-trip failed.");
 return {pkg,sourceSha:SOURCE_SHA,stats:{entries:a.entries.length,customers:a.customers.length,invoices:a.invoices.length,projects:p.projects.length,subprojects:p.projects.reduce((n,x)=>n+(x.subprojects||[]).length,0),invoiceNext:maxInvoice+1}};
}
function downloadText(filename,text,mime){
 const blob=new Blob([text],{type:mime||"application/json"}),url=URL.createObjectURL(blob),a=root.document.createElement("a");
 a.href=url;a.download=filename;root.document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function inspectImportFile(file){
 assert(file&&file.size>0,"Select the converted IndexedDB import file.");
 const pkg=JSON.parse(await file.text());
 assert(pkg.format===FORMAT&&pkg.database===DB&&pkg.sourceSha256===SOURCE_SHA,"Wrong import format, database, or approved source fingerprint.");
 assert(Array.isArray(pkg.domains)&&JSON.stringify(pkg.domains)===JSON.stringify(DOMAINS),"The import must contain the exact 17-domain set.");
 assert(Array.isArray(pkg.records)&&pkg.records.length===17,"The import must contain exactly 17 records.");
 const ids=pkg.records.map(x=>x&&x.id);
 assert(new Set(ids).size===17&&REQUIRED.every(id=>ids.includes(id)),"Import record IDs are incomplete or duplicated.");
 for(const r of pkg.records)assert(r.id===r.domain+":"+r.key&&DOMAINS.includes(r.domain),"Invalid record/domain identity.");
 const accounting=pkg.records.find(x=>x.id==="accounting:state").value,projects=pkg.records.find(x=>x.id==="projects:state").value;
 assert(accounting&&Array.isArray(accounting.entries)&&Array.isArray(accounting.customers)&&Array.isArray(accounting.invoices),"Accounting validation failed.");
 assert(projects&&Array.isArray(projects.projects)&&Array.isArray(projects.workers),"Project validation failed.");
 return pkg;
}
async function emergencyBackup(){
 const e=engine(),snapshot=await e.snapshot(DOMAINS);
 assert(snapshot&&Array.isArray(snapshot.records)&&snapshot.domains.length===17,"Could not create a complete emergency snapshot.");
 downloadText("THA-v273-before-reset-emergency-snapshot.json",JSON.stringify(snapshot));
 return snapshot;
}
async function resetWithImport(file){
 const e=engine(),pkg=await inspectImportFile(file);
 const health=await e.health();assert(health&&health.ok===true,"Database health check failed.");
 let cleared=false;
 if(health.resetLocked===true){
  if(health.resetLockPhase==="recovery"){
   // The database has already been cleared. Never clear it again;
   // continue directly with the verified full-domain restore.
   cleared=true;
  }else if(health.resetLockPhase==="preclear"){
   // Cancel only a lock that proves no data has been cleared.
   const released=await e.releaseResetLock();
   assert(released&&released.ok===true&&released.unlocked===true&&released.cancelledBeforeClear===true,"Could not safely cancel the pre-clear reset lock.");
   const newLock=await e.beginResetLock();
   assert(newLock&&newLock.ok===true&&newLock.locked===true,"Could not reacquire reset lock.");
   const newClear=await e.clearWhileResetLocked();
   assert(newClear&&newClear.ok===true&&newClear.remainingRecords===0,"Database clear was not verified.");
   cleared=true;
  }else{
   throw new Error("Reset lock phase is unknown. Database was not modified; manual recovery review is required.");
  }
 }else{
  const lock=await e.beginResetLock();
  assert(lock&&lock.ok===true&&lock.locked===true,"Could not acquire reset lock.");
  const clear=await e.clearWhileResetLocked();
  assert(clear&&clear.ok===true&&clear.remainingRecords===0,"Database clear was not verified.");
  cleared=true;
 }
 try{
  const restored=await e.restore(pkg);
  assert(restored&&restored.ok===true&&restored.fullRecovery===true,"Full restore was not verified.");
  const done=await e.completeRecovery(pkg);
  assert(done&&done.ok===true&&done.unlocked===true,"Final recovery verification failed.");
  const finalHealth=await e.health();
  assert(finalHealth.ok===true&&finalHealth.resetLocked===false,"Database remains locked.");
  return {ok:true,restored:restored.restored,verified:true,domains:17,health:finalHealth};
 }catch(error){
  error.resetLockActive=cleared;
  throw error;
 }
}
async function convertAction(){
 try{
  setStatus("Checking source backup…",false);
  const result=await convertLegacy($("factoryResetSourceFile").files[0]);
  downloadText("tha-v273-indexeddb-import.json",JSON.stringify(result.pkg));
  root.__thaV273Converted=true;
  $("factoryResetConvertedFile").disabled=false;
  $("factoryResetEmergencyButton").disabled=false;
  setStatus("Conversion successful. Domains: 17/17. Entries: "+result.stats.entries+". Customers: "+result.stats.customers+". Invoices: "+result.stats.invoices+". Projects: "+result.stats.projects+". Subprojects: "+result.stats.subprojects+". Next invoice: "+result.stats.invoiceNext+". Select the downloaded converted file below.",false);
 }catch(e){root.__thaV273Converted=false;setStatus("Conversion stopped: "+(e.message||e),true);}
}
async function emergencyAction(){
 try{
  const snapshot=await emergencyBackup();
  root.__thaV273EmergencyCreated=true;
  $("factoryResetConfirmEmergency").disabled=false;
  setStatus("Emergency snapshot downloaded. Records captured: "+snapshot.records.length+". Save that file in Files before proceeding.",false);
 }catch(e){setStatus("Emergency backup failed: "+(e.message||e),true);}
}
async function finalAction(){
 try{
  assert(root.__thaV273Converted===true,"Convert the approved original backup first.");
  assert(root.__thaV273EmergencyCreated===true,"Create the emergency snapshot first.");
  assert($("factoryResetConfirmEmergency").checked===true,"Confirm that the emergency snapshot file is saved.");
  const file=$("factoryResetConvertedFile").files[0];await inspectImportFile(file);
  const phrase=$("factoryResetConfirmPhrase").value.trim();
  assert(phrase==="RESET 273","Type RESET 273 exactly to authorize the reset.");
  $("factoryResetFinalButton").disabled=true;
  setStatus("Reset in progress. Do not close this page…",false);
  const result=await resetWithImport(file);
  setStatus("SUCCESS — restored and verified "+result.restored+" records across 17 domains. Reloading…",false);
  setTimeout(()=>root.location.reload(),1200);
 }catch(e){
  $("factoryResetFinalButton").disabled=false;
  setStatus((e.resetLockActive?"RECOVERY LOCK ACTIVE — keep this page open and retry using the converted backup. ":"Reset stopped — ")+(e.message||e),true);
 }
}
function updateFinalAvailability(){
 const final=$("factoryResetFinalButton");
 if(!final)return;
 const ready=root.__thaV273Converted===true&&root.__thaV273EmergencyCreated===true&&$("factoryResetConfirmEmergency").checked===true&&$("factoryResetConfirmPhrase").value.trim()==="RESET 273"&&$("factoryResetConvertedFile").files.length===1;
 final.disabled=!ready;
}
function bind(){
 const convert=$("factoryResetConvertButton"),emergency=$("factoryResetEmergencyButton"),final=$("factoryResetFinalButton");
 if(convert)convert.addEventListener("click",convertAction);
 if(emergency)emergency.addEventListener("click",emergencyAction);
 if(final)final.addEventListener("click",finalAction);
 ["factoryResetConfirmEmergency","factoryResetConfirmPhrase","factoryResetConvertedFile"].forEach(id=>{const el=$(id);if(el)el.addEventListener("input",updateFinalAvailability);if(el)el.addEventListener("change",updateFinalAvailability);});
 updateFinalAvailability();
}
if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",bind);else bind();
root.HandymanV273LegacyReset=Object.freeze({convertLegacy,inspectImportFile,emergencyBackup,resetWithImport});
})(window);
