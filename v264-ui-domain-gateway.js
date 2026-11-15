/* THA v264 UI domain gateway — isolated startup edition.
   Each application domain initializes independently. A failure in one domain must
   not disable unrelated domains. No LocalStorage fallback, import, or shadow write.
*/
(function(root){
 "use strict";
 const clone=v=>root.structuredClone(v);
 const boot=()=>{const x=root.HandymanModuleBootstrapV264;if(!x)throw new Error("v264 module bootstrap is not loaded.");return x;};
 const controllers={accounting:()=>root.HandymanAccountingV264,projects:()=>root.HandymanProjectsV264,contracts:()=>root.HandymanContractsV264,businessProfile:()=>root.HandymanBusinessProfileV264,support:()=>root.HandymanSupportV264};
 const names=["accounting","projects","contracts","businessProfile","support"];
 let ready=false,initializing=null,states={},domainStatus={};
 async function initialize(){
  if(ready)return {ok:true,mode:"indexeddb-only",legacyImport:false,states:clone(states),domainStatus:clone(domainStatus)};
  if(initializing)return initializing;
  initializing=(async()=>{
   const starters={accounting:()=>boot().startAccounting(),projects:()=>boot().startProjects(),contracts:()=>boot().startContracts(),businessProfile:()=>boot().startBusinessProfile(),support:()=>boot().startSupport()};
   const settled=await Promise.allSettled(names.map(name=>starters[name]()));
   const nextStates={},nextStatus={};
   settled.forEach((item,index)=>{
    const name=names[index];
    if(item.status==="fulfilled"&&item.value&&item.value.ok===true&&item.value.mode==="indexeddb-only"&&item.value.legacyImport===false){
     nextStates[name]=clone(item.value.state);nextStatus[name]={ok:true,database:item.value.database||null};
    }else{
     const error=item.status==="rejected"?item.reason:new Error("IndexedDB startup verification failed for "+name+".");
     nextStatus[name]={ok:false,error:String(error&&error.message||error)};
     console.error("THA independent domain startup failed: "+name,error);
    }
   });
   states=nextStates;domainStatus=nextStatus;ready=names.some(name=>nextStatus[name]?.ok===true);
   if(!ready)throw new Error("No application domain could initialize. "+names.map(n=>n+": "+(nextStatus[n]?.error||"not ready")).join(" | "));
   return {ok:true,mode:"indexeddb-only",legacyImport:false,database:nextStatus.accounting?.database||nextStatus.projects?.database||null,states:clone(states),domainStatus:clone(domainStatus)};
  })().catch(error=>{if(!ready){states={};domainStatus={};}throw error;}).finally(()=>{initializing=null;});
  return initializing;
 }
 function requireReady(name){
  if(!ready)throw new Error("The v264 IndexedDB UI gateway has not completed startup.");
  if(name&&!domainStatus[name]?.ok)throw new Error("IndexedDB domain "+name+" is unavailable: "+(domainStatus[name]?.error||"startup failed."));
 }
 function api(name){const get=controllers[name];if(!get)throw new Error("Unknown application domain: "+name);const value=get();if(!value)throw new Error("IndexedDB controller is unavailable for "+name);return value;}
 async function load(name){
  requireReady(name);let value;
  if(name==="support"){
   value=await api(name).loadReportWorkspace();const workspace=value;
   states.support={...states.support,reports:clone(workspace.archive||[]),reportNotifications:clone(workspace.notifications||[]),reportSettings:clone(workspace.settings||{}),reportWorkflow:clone(workspace.workflow||{})};
   return clone(workspace);
  }else if(name==="projects"){value=await api(name).load();value={...value,profile:{}};}
  else value=await api(name).load();
  states[name]=clone(value);return clone(value);
 }
 async function save(name,value){
  requireReady(name);let result;
  if(name==="accounting")result=await api(name).save(value);
  else if(name==="projects"){
   const projectState=clone(value),uiProfile=projectState.profile&&typeof projectState.profile==="object"?clone(projectState.profile):{};
   delete projectState.profile;result=await api(name).save(projectState);
   if(!result||result.ok!==true)throw new Error("Projects domain did not confirm its save.");
   const verified=await api(name).load();
   if(!(await root.HandymanStorageV264.valuesEqual(verified,projectState)))throw new Error("Projects-only IndexedDB read-back verification failed.");
   states.projects=clone(verified);return {ok:true,verified:true,state:clone({...verified,profile:uiProfile})};
  }else if(name==="contracts")result=await api(name).save(value);
  else if(name==="businessProfile")result=await api(name).save(value);
  else if(name==="support")result=await api(name).saveReportWorkspace(value);
  else throw new Error("Unknown application domain: "+name);
  if(!result||result.ok!==true)throw new Error("IndexedDB did not confirm the "+name+" save.");
  const verified=await load(name),expected=name==="businessProfile"?(result.profile||value):value;
  if(name!=="support"&&!(await root.HandymanStorageV264.valuesEqual(verified,expected)))throw new Error("IndexedDB read-back verification failed for "+name+".");
  return {ok:true,verified:true,state:clone(verified)};
 }
 async function update(name,mutator){
  requireReady(name);if(typeof mutator!=="function")throw new TypeError("A synchronous state mutator is required.");
  const current=await load(name),next=mutator(clone(current));
  if(next&&typeof next.then==="function")throw new Error("UI state mutators must be synchronous.");
  return save(name,next===undefined?current:next);
 }
 async function flush(){
  requireReady();const available=names.filter(name=>domainStatus[name]?.ok);
  const results=await Promise.all(available.map(async name=>({name,state:await load(name)})));
  return {ok:true,verified:true,domains:results.length,states:Object.fromEntries(results.map(x=>[x.name,x.state])),domainStatus:clone(domainStatus)};
 }
 root.HandymanUIDomainGatewayV264=Object.freeze({initialize,load,save,update,flush,get ready(){return ready;},get states(){return ready?clone(states):null;},get domainStatus(){return clone(domainStatus);}});
})(window);
