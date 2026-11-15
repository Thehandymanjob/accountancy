/* THA v264 UI domain gateway.
   One async entry point for the preserved UI. Every application domain is backed
   by its own IndexedDB controller. No LocalStorage fallback, import, or shadow write.
   UI handlers must await these methods; this gateway never pretends async writes are sync.
*/
(function(root){
 "use strict";
 const clone=v=>root.structuredClone(v);
 const boot=()=>{const x=root.HandymanModuleBootstrapV264;if(!x)throw new Error("v264 module bootstrap is not loaded.");return x;};
 const controllers={
  accounting:()=>root.HandymanAccountingV264,
  projects:()=>root.HandymanProjectsV264,
  contracts:()=>root.HandymanContractsV264,
  businessProfile:()=>root.HandymanBusinessProfileV264,
  support:()=>root.HandymanSupportV264
 };
 let ready=false,initializing=null,states=null;
 async function initialize(){
  if(ready)return {ok:true,mode:"indexeddb-only",legacyImport:false,states:clone(states)};
  if(initializing)return initializing;
  initializing=(async()=>{
   const names=["accounting","projects","contracts","businessProfile","support"];
   const results=await Promise.all([
    boot().startAccounting(),boot().startProjects(),boot().startContracts(),
    boot().startBusinessProfile(),boot().startSupport()
   ]);
   const next={};names.forEach((name,i)=>{if(!results[i]||results[i].ok!==true||results[i].mode!=="indexeddb-only"||results[i].legacyImport!==false)throw new Error("IndexedDB startup verification failed for "+name+".");next[name]=clone(results[i].state);});
   states=next;ready=true;
   return {ok:true,mode:"indexeddb-only",legacyImport:false,database:results[0].database,states:clone(states)};
  })().catch(error=>{ready=false;states=null;throw error;}).finally(()=>{initializing=null;});
  return initializing;
 }
 function requireReady(){if(!ready)throw new Error("The v264 IndexedDB UI gateway has not completed startup.");}
 function api(name){const get=controllers[name];if(!get)throw new Error("Unknown application domain: "+name);const value=get();if(!value)throw new Error("IndexedDB controller is unavailable for "+name);return value;}
 async function load(name){
  requireReady();
  let value;
  if(name==="support"){
   value=await api(name).loadReportWorkspace();
   const workspace=value;
   states.support={...states.support,reports:clone(workspace.archive||[]),reportNotifications:clone(workspace.notifications||[]),reportSettings:clone(workspace.settings||{}),reportWorkflow:clone(workspace.workflow||{})};
   return clone(workspace);
  }else if(name==="projects"){value=await api(name).load();value={...value,profile:{}};}
  else value=await api(name).load();
  states[name]=clone(value);return clone(value);
 }
 async function save(name,value){
  requireReady();
  let result;
  if(name==="accounting")result=await api(name).save(value);
  else if(name==="projects"){
   const projectState=clone(value);
   const uiProfile=projectState.profile&&typeof projectState.profile==="object"?clone(projectState.profile):{};
   delete projectState.profile;
   result=await api(name).save(projectState);
   if(!result||result.ok!==true)throw new Error("Projects domain did not confirm its save.");
   const verified=await api(name).load();
   if(!(await root.HandymanStorageV264.valuesEqual(verified,projectState)))throw new Error("Projects-only IndexedDB read-back verification failed.");
   states.projects=clone(verified);
   return {ok:true,verified:true,state:clone({...verified,profile:uiProfile})};
  }
  else if(name==="contracts")result=await api(name).save(value);
  else if(name==="businessProfile")result=await api(name).save(value);
  else if(name==="support")result=await api(name).saveReportWorkspace(value);
  else throw new Error("Unknown application domain: "+name);
  if(!result||result.ok!==true)throw new Error("IndexedDB did not confirm the "+name+" save.");
  const verified=await load(name);
  const expected=name==="businessProfile"?(result.profile||value):name==="support"?value:value;
  if(name!=="support" && !(await root.HandymanStorageV264.valuesEqual(verified,expected)))throw new Error("IndexedDB read-back verification failed for "+name+".");
  return {ok:true,verified:true,state:clone(verified)};
 }
 async function update(name,mutator){
  requireReady();if(typeof mutator!=="function")throw new TypeError("A synchronous state mutator is required.");
  const current=await load(name),next=mutator(clone(current));
  if(next&&typeof next.then==="function")throw new Error("UI state mutators must be synchronous.");
  return save(name,next===undefined?current:next);
 }
 async function flush(){requireReady();const names=["accounting","projects","contracts","businessProfile","support"];const checks=await Promise.all(names.map(load));return {ok:true,verified:true,domains:names.length,states:checks};}
 root.HandymanUIDomainGatewayV264=Object.freeze({initialize,load,save,update,flush,get ready(){return ready;},get states(){return ready?clone(states):null;}});
})(window);
