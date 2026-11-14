/* THA v264 asynchronous Projects domain controller.
   Preserves the existing project object model and all unknown fields.
   IndexedDB structured cloning is used for nested Blob/File media; no legacy storage.
*/
(function(root){
 "use strict";
 const storage=()=>{const api=root.HandymanAppStorageV264;if(!api)throw new Error("v264 application storage adapter is unavailable.");return api;};
 const clone=value=>root.structuredClone(value);
 const collections=["workers","partners","contractors","companies","companyJobs"];
 const ledgerCollections=["income","expenses","wages","tools","food","contractors","materials"];
 function normalize(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Projects state has an invalid structure.");
  const state={...value};
  if(!Array.isArray(state.projects)||!Array.isArray(state.workers))throw new Error("Projects state requires projects and workers arrays.");
  for(const key of collections)if(!Array.isArray(state[key]))state[key]=[];
  if(Object.prototype.hasOwnProperty.call(state,"profile")){
   const profile=state.profile;
   const hasProfile=profile&&typeof profile==="object"&&!Array.isArray(profile)&&Object.values(profile).some(value=>value!==""&&value!==null&&value!==undefined);
   if(hasProfile)throw new Error("Projects state contains legacy Business Profile data. Move and verify it in the separate Business Profile domain before saving Projects.");
   delete state.profile;
  }
  if(!("current" in state))state.current=null;
  if(!("guide" in state))state.guide="en";
  const ids=new Set();
  for(const p of state.projects){
   if(!p||typeof p!=="object"||!p.id)throw new Error("Every project must have a stable ID.");
   if(ids.has(String(p.id)))throw new Error("Duplicate project ID: "+p.id);
   ids.add(String(p.id));
   if(p.subprojects!==undefined&&!Array.isArray(p.subprojects))throw new Error("Project subprojects must be an array.");
   if(Array.isArray(p.subprojects)){
    const subIds=new Set();
    for(const sub of p.subprojects){if(!sub||typeof sub!=="object"||!sub.id)throw new Error("Every sub-project must have a stable ID.");if(subIds.has(String(sub.id)))throw new Error("Duplicate sub-project ID: "+sub.id);subIds.add(String(sub.id));}
   }
  }
  return state;
 }
 async function initialize(){await storage().initialize();return load();}
 async function load(){return normalize(await storage().read("projects"));}
 async function save(value){
  const state=normalize(clone(value));
  const result=await storage().write("projects",state);
  if(!result||result.ok!==true)throw new Error("Projects state write was not confirmed.");
  const verified=normalize(await storage().read("projects"));
  const equal=await root.HandymanStorageV264.valuesEqual(verified,state);
  if(!equal)throw new Error("Projects state verification failed after save.");
  return {ok:true,state:verified};
 }
 async function update(mutator){
  if(typeof mutator!=="function")throw new Error("A synchronous Projects updater is required.");
  const result=await storage().mutate("projects",current=>{
   const state=normalize(current),next=mutator(state);
   if(next&&typeof next.then==="function")throw new Error("Projects updater must be synchronous.");
   return normalize(next===undefined?state:next);
  });
  if(!result||result.ok!==true)throw new Error("Atomic Projects update was not confirmed.");
  return {ok:true,state:normalize(result.state)};
 }
 async function addProject(project){
  if(!project||typeof project!=="object"||!project.id||!String(project.name||"").trim())throw new Error("A project ID and name are required.");
  return update(s=>{if(s.projects.some(p=>String(p.id)===String(project.id)))throw new Error("Project ID already exists.");s.projects.unshift(clone(project));return s;});
 }
 async function updateProject(id,changes){
  return update(s=>{const i=s.projects.findIndex(p=>String(p.id)===String(id));if(i<0)throw new Error("Project not found.");s.projects[i]={...s.projects[i],...clone(changes),id:s.projects[i].id};return s;});
 }
 async function deleteProject(id){
  return update(s=>{const p=s.projects.find(x=>String(x.id)===String(id));if(!p)throw new Error("Project not found.");if(p.status==="complete")throw new Error("Completed projects must be reopened before deletion.");s.projects=s.projects.filter(x=>String(x.id)!==String(id));if(String(s.current)===String(id))s.current=null;return s;});
 }
 async function addSubproject(projectId,subproject){
  if(!subproject||typeof subproject!=="object"||!subproject.id||!String(subproject.name||"").trim())throw new Error("A sub-project ID and name are required.");
  return update(s=>{const p=s.projects.find(x=>String(x.id)===String(projectId));if(!p)throw new Error("Project not found.");p.subprojects=Array.isArray(p.subprojects)?p.subprojects:[];if(p.subprojects.some(x=>String(x.id)===String(subproject.id)))throw new Error("Sub-project ID already exists.");p.subprojects.push(clone(subproject));p.hasSubprojects=true;return s;});
 }
 async function updateSubproject(projectId,subprojectId,changes){
  return update(s=>{const p=s.projects.find(x=>String(x.id)===String(projectId));const sub=p&&(p.subprojects||[]).find(x=>String(x.id)===String(subprojectId));if(!sub)throw new Error("Sub-project not found.");Object.assign(sub,clone(changes),{id:sub.id});return s;});
 }
 async function deleteSubproject(projectId,subprojectId){
  return update(s=>{const p=s.projects.find(x=>String(x.id)===String(projectId));if(!p)throw new Error("Project not found.");const before=(p.subprojects||[]).length;p.subprojects=(p.subprojects||[]).filter(x=>String(x.id)!==String(subprojectId));if(p.subprojects.length===before)throw new Error("Sub-project not found.");p.hasSubprojects=p.subprojects.length>0;return s;});
 }
 async function saveDirectory(kind,item){
  if(!collections.includes(kind))throw new Error("Unsupported Projects directory: "+kind);
  if(!item||typeof item!=="object"||!item.id)throw new Error("A directory record with a stable ID is required.");
  return update(s=>{const list=s[kind],i=list.findIndex(x=>String(x.id)===String(item.id));if(i<0)list.push(clone(item));else list[i]=clone(item);return s;});
 }
 async function deleteDirectory(kind,id){
  if(!collections.includes(kind))throw new Error("Unsupported Projects directory: "+kind);
  return update(s=>{s[kind]=s[kind].filter(x=>String(x.id)!==String(id));return s;});
 }
 async function saveLedgerRecord(projectId,subprojectId,collection,record){
  if(!ledgerCollections.includes(collection))throw new Error("Unsupported project ledger collection: "+collection);
  if(!record||typeof record!=="object"||!record.id)throw new Error("A ledger record with a stable ID is required.");
  return update(s=>{const p=s.projects.find(x=>String(x.id)===String(projectId));if(!p)throw new Error("Project not found.");const ledger=subprojectId?(p.subprojects||[]).find(x=>String(x.id)===String(subprojectId)):p;if(!ledger)throw new Error("Sub-project not found.");ledger[collection]=Array.isArray(ledger[collection])?ledger[collection]:[];const i=ledger[collection].findIndex(x=>String(x.id)===String(record.id));if(i<0)ledger[collection].push(clone(record));else ledger[collection][i]=clone(record);return s;});
 }
 async function deleteLedgerRecord(projectId,subprojectId,collection,recordId){
  if(!ledgerCollections.includes(collection))throw new Error("Unsupported project ledger collection: "+collection);
  return update(s=>{const p=s.projects.find(x=>String(x.id)===String(projectId));if(!p)throw new Error("Project not found.");const ledger=subprojectId?(p.subprojects||[]).find(x=>String(x.id)===String(subprojectId)):p;if(!ledger)throw new Error("Sub-project not found.");ledger[collection]=(ledger[collection]||[]).filter(x=>String(x.id)!==String(recordId));return s;});
 }
 root.HandymanProjectsV264=Object.freeze({initialize,load,save,update,addProject,updateProject,deleteProject,addSubproject,updateSubproject,deleteSubproject,saveDirectory,deleteDirectory,saveLedgerRecord,deleteLedgerRecord,collections:Object.freeze(collections.slice()),ledgerCollections:Object.freeze(ledgerCollections.slice())});
})(window);
