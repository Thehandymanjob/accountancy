/* THA Projects IndexedDB repository — isolated migration prototype.
   This module writes only to a dedicated IndexedDB kv key. It never touches
   LocalStorage, the live app's Projects key, accounting, contracts, or backups.
*/
(function(root){
 "use strict";
 const KEY="__tha_idb_projects_migration_v1__";
 const TEST_KEY="__tha_idb_projects_migration_selftest_v1__";
 function api(){
  const a=root.HandymanStorageFoundation;
  if(!a||typeof a.get!=="function"||typeof a.set!=="function"||typeof a.remove!=="function")
   throw new Error("The test IndexedDB foundation is unavailable.");
  return a;
 }
 function validate(x){
  if(!x||typeof x!=="object"||Array.isArray(x))throw new Error("Projects payload must be an object.");
  if(!Array.isArray(x.projects)||!Array.isArray(x.workers))throw new Error("Projects and workers arrays are required.");
  for(const k of ["partners","contractors","companies","companyJobs"])
   if(x[k]!==undefined&&!Array.isArray(x[k]))throw new Error(k+" must be an array.");
  if(x.profile!==undefined&&(!x.profile||typeof x.profile!=="object"||Array.isArray(x.profile)))
   throw new Error("Projects profile must be an object.");
  return x;
 }
 async function readKey(key){return api().get(key)}
 async function writeKey(key,raw){
  await api().set(key,raw);
  const check=await api().get(key);
  if(check!==raw)throw new Error("IndexedDB read-back verification failed for "+key);
  return {ok:true,bytes:new Blob([raw]).size};
 }
 async function load(){const raw=await readKey(KEY);if(raw===null)return null;let x;try{x=JSON.parse(raw)}catch(e){throw new Error("IndexedDB Projects record is not valid JSON; it was not changed.")}return validate(x)}
 async function save(value){validate(value);const raw=JSON.stringify(value);if(typeof raw!=="string")throw new Error("Projects serialization failed.");return writeKey(KEY,raw)}
 async function restoreBackupObject(parsed){
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Backup root must be an object.");
  if(parsed.app!==undefined&&parsed.app!=="The Handyman Accountancy")throw new Error("This backup belongs to a different app.");
  if(parsed.backupType!==undefined&&parsed.backupType!=="complete-user-data")throw new Error("Unsupported backup type.");
  const candidate=validate(parsed.projects);
  // Preserve the backup's Projects object byte-for-byte at the JSON data level.
  // Price normalization is deliberately deferred until the app's own restore
  // rules are applied; this lab must not alter the £300/sub-project evidence.
  const preserved=JSON.parse(JSON.stringify(candidate));
  const raw=JSON.stringify(preserved);
  const previous=await readKey(KEY);
  try{
   const result=await writeKey(KEY,raw);
   const check=await load();
   if(JSON.stringify(check)!==raw)throw new Error("Imported Projects payload did not match its verified read-back.");
   return {ok:true,bytes:result.bytes,projects:check.projects.length,workers:check.workers.length,
    subprojects:check.projects.reduce((n,p)=>n+(Array.isArray(p.subprojects)?p.subprojects.length:0),0),
    previousRecordPreservedUntilVerified:true,appCutover:false,localStorageChanged:false};
  }catch(error){
   try{if(previous===null)await api().remove(KEY);else await writeKey(KEY,previous)}catch(rollbackError){
    throw new Error("Import failed and IndexedDB rollback could not be verified. Do not clear browser data. Original error: "+(error.message||error)+"; rollback: "+(rollbackError.message||rollbackError));
   }
   throw error;
  }
 }
 async function importFile(file){
  if(!file)throw new Error("Choose a backup JSON file first.");
  const parsed=JSON.parse(await file.text());
  if(!Object.prototype.hasOwnProperty.call(parsed,"projects")||parsed.projects===null)
   throw new Error("The selected backup does not contain Projects data.");
  return restoreBackupObject(parsed);
 }
 async function selfTest(){
  const before=await api().get(TEST_KEY);
  if(before!==null)throw new Error("Prototype self-test key is already occupied; refusing to overwrite it.");
  const photo="data:image/jpeg;base64,"+"A".repeat(6*1024*1024);
  const fixture={projects:[{id:"idb-test-project",name:"Synthetic test project",photo,subprojects:[{id:"sub-300",name:"Extra Job",price:300}]}],
   workers:[{id:"idb-test-worker",name:"Synthetic worker"}],partners:[],contractors:[],companies:[],companyJobs:[],profile:{businessName:"Synthetic test"}};
  const raw=JSON.stringify(fixture);let saved=false;
  try{
   await writeKey(TEST_KEY,raw);saved=true;
   const read=JSON.parse(await api().get(TEST_KEY));
   const checks={projectCount:read.projects.length===1,subprojectAmount:read.projects[0].subprojects[0].price===300,
    photoPayloadPreserved:read.projects[0].photo===photo,largePayloadBytes:new Blob([raw]).size};
   if(!checks.projectCount||!checks.subprojectAmount||!checks.photoPayloadPreserved)throw new Error("Large-payload round-trip test failed.");
   return {ok:true,checks,legacyLocalStorageChanged:false,liveProjectsChanged:false,appCutover:false};
  }finally{if(saved)await api().remove(TEST_KEY)}
 }
 root.HandymanProjectsIDBMigration={key:KEY,load,save,restoreBackupObject,importFile,selfTest};
})(window);


// Normalized workspace repository: one add-only transaction across all stores.
(function(root){
 "use strict";
 const map={projects:"projects",workers:"workers",partners:"partners",contractors:"contractors",companies:"companies",companyJobs:"companyJobs"};
 const profileId="__tha_projects_profile_v1__",stateId="__tha_projects_workspace_state_v1__",manifestId="__tha_projects_workspace_manifest_v1__";
 function api(){const a=root.HandymanStorageFoundation;if(!a||!a.bulkAddAcrossStores||!a.bulkWriteAcrossStores||!a.getAllRecords)throw Error("IndexedDB repository API unavailable");return a;}
 function prepare(x){
  if(!x||typeof x!=="object"||Array.isArray(x)||!Array.isArray(x.projects)||!Array.isArray(x.workers))throw Error("Projects and workers arrays are required.");
  for(const k of ["partners","contractors","companies","companyJobs"])if(x[k]!==undefined&&!Array.isArray(x[k]))throw Error(k+" must be an array.");
  const out={};
  for(const k of Object.keys(map)){out[map[k]]=(x[k]||[]).map((r,i)=>{if(!r||typeof r!=="object"||Array.isArray(r)||(typeof r.id!=="string"&&!(typeof r.id==="number"&&Number.isFinite(r.id)))||String(r.id).trim()==="")throw Error(k+" record "+i+" has no valid id");return JSON.parse(JSON.stringify(r));});}
  const meta=[];if(x.profile!==undefined){if(!x.profile||typeof x.profile!=="object"||Array.isArray(x.profile))throw Error("Invalid profile");meta.push({id:profileId,kind:"projects-profile",value:JSON.parse(JSON.stringify(x.profile))});}
  const workspaceState={};for(const [k,v] of Object.entries(x))if(!Object.prototype.hasOwnProperty.call(map,k)&&k!=="profile")workspaceState[k]=JSON.parse(JSON.stringify(v));
  meta.push({id:stateId,kind:"projects-workspace-state",value:workspaceState});
  const counts={};for(const k of Object.keys(map))counts[map[k]]=out[map[k]].length;
  meta.push({id:manifestId,kind:"projects-workspace-manifest",schema:1,counts,subprojectCount:x.projects.reduce((n,p)=>n+(Array.isArray(p.subprojects)?p.subprojects.length:0),0),createdAt:new Date().toISOString()});
  out.projectMetadata=meta;return out;
 }
 async function inspectBackupFile(file){
  if(!file)throw Error("Select a backup JSON file");
  const b=JSON.parse(await file.text());
  const stable=v=>Array.isArray(v)?v.map(stable):(v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v);
  const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  const fieldInfo=v=>{if(v===undefined)return {type:"missing"};if(v===null||typeof v==="number"||typeof v==="boolean")return {type:v===null?"null":typeof v,value:v};if(typeof v==="string")return {type:"string",length:v.length,value:v.length<=120?v:undefined};if(Array.isArray(v))return {type:"array",count:v.length,bytes:new TextEncoder().encode(JSON.stringify(v)).length};return {type:"object",keys:Object.keys(v).sort(),bytes:new TextEncoder().encode(JSON.stringify(v)).length};};
  if(!b||typeof b!=="object"||Array.isArray(b))throw Error("Invalid backup root");
  if(b.app!==undefined&&b.app!=="The Handyman Accountancy")throw Error("Backup belongs to another app");
  if(b.backupType!==undefined&&b.backupType!=="complete-user-data")throw Error("Unsupported backup type");
  const rows=prepare(b.projects),a=api(),stores={},duplicates=[],existing=[],conflictDetails=[];
  let totalRecords=0,totalBytes=0;
  for(const [store,records] of Object.entries(rows)){
   const seen=new Set();let bytes=0;
   for(const record of records){
    const id=String(record.id);if(seen.has(id))duplicates.push({store,id});seen.add(id);
    bytes+=new TextEncoder().encode(JSON.stringify(record)).length;
   }
   const identical=[],conflicting=[];
   for(const record of records){const prior=await a.getRecord(store,record.id);if(prior){if(recordsEqual(store,prior,record))identical.push(String(record.id));else{conflicting.push(String(record.id));if(store==="projects"){
    const keys=[...new Set([...Object.keys(record),...Object.keys(prior)])],changedFields=keys.filter(k=>!equal(record[k],prior[k]));
    const sub=(v)=>Array.isArray(v)?v.map(x=>String(x&&x.id!==undefined?x.id:"<no-id>")):[];
    const incomingSubs=Array.isArray(record.subprojects)?record.subprojects:[],existingSubs=Array.isArray(prior.subprojects)?prior.subprojects:[];
    const byId=(arr)=>new Map(arr.map((x,i)=>[String(x&&x.id!==undefined?x.id:"<index-"+i+">"),x]));
    const im=byId(incomingSubs),em=byId(existingSubs),all=[...new Set([...im.keys(),...em.keys()])];
    const subChanges=all.filter(id=>!im.has(id)||!em.has(id)||!equal(im.get(id),em.get(id)));
    const valueInfo=(v)=>({type:v===null?"null":Array.isArray(v)?"array":typeof v,bytes:v===undefined?0:new TextEncoder().encode(JSON.stringify(v)).length,arrayCount:Array.isArray(v)?v.length:undefined});
    const compactFields=(v,only)=>{const out={};for(const k of (only||Object.keys(v||{}))){const z=v&&v[k];if(z===undefined)continue;if(z===null||["string","number","boolean"].includes(typeof z))out[k]=z;else if(Array.isArray(z))out[k]={type:"array",count:z.length};else if(typeof z==="object")out[k]={type:"object",keys:Object.keys(z).sort()};}return out;};
    const incomeInfo=(arr)=>{const list=Array.isArray(arr)?arr:[];return list.map((v,i)=>({key:String(v&&v.id!==undefined?v.id:"<index-"+i+">"),value:v,index:i}));};
    const incomeDetails=(x,y)=>{const ix=incomeInfo(x&&x.income),ey=incomeInfo(y&&y.income),im=new Map(ix.map(v=>[v.key,v])),em=new Map(ey.map(v=>[v.key,v])),keys=[...new Set([...im.keys(),...em.keys()])];return {incomingCount:ix.length,existingCount:ey.length,added:keys.filter(k=>im.has(k)&&!em.has(k)).map(k=>({key:k,index:im.get(k).index,fields:compactFields(im.get(k).value)})),removed:keys.filter(k=>!im.has(k)&&em.has(k)).map(k=>({key:k,index:em.get(k).index,fields:compactFields(em.get(k).value)})),changed:keys.filter(k=>im.has(k)&&em.has(k)&&!equal(im.get(k).value,em.get(k).value)).map(k=>{const a=im.get(k).value,b=em.get(k).value,fs=[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].filter(q=>!equal(a&&a[q],b&&b[q]));return {key:k,index:im.get(k).index,changedFields:fs,incoming:compactFields(a,fs),existing:compactFields(b,fs)};})};};
    const subprojectDetails=subChanges.filter(sid=>im.has(sid)&&em.has(sid)).map(sid=>{const x=im.get(sid),y=em.get(sid),ks=[...new Set([...Object.keys(x||{}),...Object.keys(y||{})])],diff=ks.filter(k=>!equal(x&&x[k],y&&y[k]));return {id:sid,changedFields:diff,incoming:Object.fromEntries(diff.map(k=>[k,fieldInfo(x&&x[k])])),existing:Object.fromEntries(diff.map(k=>[k,fieldInfo(y&&y[k])])),incomeComparison:incomeDetails(x,y)};});
    conflictDetails.push({store,id:String(record.id),changedFields,incomingFieldSummary:Object.fromEntries(changedFields.map(k=>[k,valueInfo(record[k])])),existingFieldSummary:Object.fromEntries(changedFields.map(k=>[k,valueInfo(prior[k])])),incomingSubprojectIds:sub(record.subprojects),existingSubprojectIds:sub(prior.subprojects),changedSubprojectIds:subChanges,subprojectDetails});
   }}}}
   if(identical.length||conflicting.length)existing.push({store,identicalCount:identical.length,identicalIds:identical.slice(0,10),conflictingCount:conflicting.length,conflictingIds:conflicting.slice(0,10)});
   stores[store]={records:records.length,approxBytes:bytes,identicalExisting:identical.length,conflictingExisting:conflicting.length,missing:records.length-identical.length-conflicting.length};
   totalRecords+=records.length;totalBytes+=bytes;
  }
  const metadataConflictDetails=[];for(const record of (rows.projectMetadata||[])){const prior=await a.getRecord("projectMetadata",record.id);if(prior&&!recordsEqual("projectMetadata",prior,record)){const changedFields=[...new Set([...Object.keys(record),...Object.keys(prior)])].filter(k=>!equal(record[k],prior[k]));metadataConflictDetails.push({id:String(record.id),kind:record.kind||null,changedFields,incomingFieldSummary:Object.fromEntries(changedFields.map(k=>[k,fieldInfo(record[k])])),existingFieldSummary:Object.fromEntries(changedFields.map(k=>[k,fieldInfo(prior[k])]))});}}
  const incomeComparison=[];
  const backupProjects=Array.isArray(b.projects.projects)?b.projects.projects:[];
  for(const bp of backupProjects){
   const live=await a.getRecord("projects",bp.id);
   const backupSubs=Array.isArray(bp.subprojects)?bp.subprojects:[],liveSubs=Array.isArray(live&&live.subprojects)?live.subprojects:[];
   const liveMap=new Map(liveSubs.filter(x=>x&&x.id!==undefined).map(x=>[String(x.id),x]));
   for(const bs of backupSubs){
    const ls=liveMap.get(String(bs&&bs.id));
    const bi=Array.isArray(bs&&bs.income)?bs.income:[],li=Array.isArray(ls&&ls.income)?ls.income:[];
    const bm=new Map(bi.filter(x=>x&&x.id!==undefined).map(x=>[String(x.id),x]));
    const lm=new Map(li.filter(x=>x&&x.id!==undefined).map(x=>[String(x.id),x]));
    const ids=[...new Set([...bm.keys(),...lm.keys()])];
    const missing=ids.filter(id=>bm.has(id)&&!lm.has(id));
    const extra=ids.filter(id=>!bm.has(id)&&lm.has(id));
    const changed=ids.filter(id=>bm.has(id)&&lm.has(id)&&!equal(bm.get(id),lm.get(id)));
    const amountTotal=arr=>arr.reduce((n,x)=>{const v=Number(x&&x.amount);return n+(Number.isFinite(v)?v:0);},0);
    incomeComparison.push({subprojectId:bs&&bs.id!==undefined?String(bs.id):null,backupCount:bi.length,indexedDBCount:li.length,backupAmountTotal:amountTotal(bi),indexedDBAmountTotal:amountTotal(li),identicalCount:ids.length-missing.length-extra.length-changed.length,missingInIndexedDB:missing,extraInIndexedDB:extra,changedIncomeIds:changed});
   }
  }
  const incomeMismatchCount=incomeComparison.reduce((n,x)=>n+x.missingInIndexedDB.length+x.extraInIndexedDB.length+x.changedIncomeIds.length,0);
  const conflictingTotal=existing.reduce((n,x)=>n+x.conflictingCount,0),identicalTotal=existing.reduce((n,x)=>n+x.identicalCount,0);
  return {ok:duplicates.length===0&&conflictingTotal===0&&incomeMismatchCount===0,readOnly:true,willWrite:false,appCutover:false,localStorageChanged:false,backupChanged:false,fileName:file.name,fileBytes:file.size,stores,totalRecords,totalSubprojects:b.projects.projects.reduce((n,p)=>n+(Array.isArray(p.subprojects)?p.subprojects.length:0),0),approxIndexedDBBytes:totalBytes,duplicateIncomingIds:duplicates,identicalExistingRecords:identicalTotal,conflictingExistingRecords:conflictingTotal,existingRecordComparisons:existing,conflictDetails,metadataConflictDetails,incomeComparison,incomeMismatchCount};
 }
 function stableValue(v){return Array.isArray(v)?v.map(stableValue):(v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stableValue(v[k])])):v);}
 function sameValue(a,b){return JSON.stringify(stableValue(a))===JSON.stringify(stableValue(b));}
 function recordsEqual(store,a,b){if(store!=="projectMetadata"||!a||!b||a.kind!=="projects-workspace-manifest"||b.kind!=="projects-workspace-manifest")return sameValue(a,b);const x={...a},y={...b};delete x.createdAt;delete y.createdAt;return sameValue(x,y);}
 function mergeProjectIncome(existing,incoming){
  if(!existing||!incoming||String(existing.id)!==String(incoming.id))throw Error("Project/subproject identity mismatch.");
  const topChanged=[...new Set([...Object.keys(existing),...Object.keys(incoming)])].filter(k=>!sameValue(existing[k],incoming[k]));
  if(topChanged.some(k=>k!=="subprojects"))throw Error("Project conflict outside subprojects: "+topChanged.filter(k=>k!=="subprojects").join(", "));
  const oldSubs=Array.isArray(existing.subprojects)?existing.subprojects:[],newSubs=Array.isArray(incoming.subprojects)?incoming.subprojects:[];
  const oldMap=new Map(),newMap=new Map();
  for(const p of oldSubs){if(!p||p.id===undefined||oldMap.has(String(p.id)))throw Error("Existing subprojects contain missing or duplicate IDs.");oldMap.set(String(p.id),p);}
  for(const p of newSubs){if(!p||p.id===undefined||newMap.has(String(p.id)))throw Error("Backup subprojects contain missing or duplicate IDs.");newMap.set(String(p.id),p);}
  if(oldMap.size!==newMap.size||[...oldMap.keys()].some(id=>!newMap.has(id)))throw Error("Subproject additions/removals require manual review.");
  const mergedSubs=oldSubs.map(oldSub=>{
   const newSub=newMap.get(String(oldSub.id));
   const changed=[...new Set([...Object.keys(oldSub),...Object.keys(newSub)])].filter(k=>!sameValue(oldSub[k],newSub[k]));
   if(changed.some(k=>k!=="income"))throw Error("Subproject "+oldSub.id+" has changes outside Income: "+changed.filter(k=>k!=="income").join(", "));
   const oldIncome=Array.isArray(oldSub.income)?oldSub.income:[],newIncome=Array.isArray(newSub.income)?newSub.income:[];
   const byId=new Map();
   for(const item of oldIncome){if(!item||item.id===undefined||byId.has(String(item.id)))throw Error("Existing Income contains missing or duplicate IDs in subproject "+oldSub.id);byId.set(String(item.id),item);}
   const appended=[];
   for(const item of newIncome){
    if(!item||item.id===undefined)throw Error("Backup Income item has no ID in subproject "+oldSub.id);
    const id=String(item.id);
    if(byId.has(id)){if(!sameValue(byId.get(id),item))throw Error("Income ID collision with different values: "+id);continue;}
    byId.set(id,item);appended.push(item);
   }
   return {...oldSub,income:[...oldIncome,...appended]};
  });
  return {...existing,subprojects:mergedSubs};
 }
 async function importWorkspace(x){
  const rows=prepare(x),a=api();
  if(typeof a.bulkWriteAcrossStores!=="function")throw Error("Atomic cross-store merge API is unavailable; no data was written.");
  const ops={},conflicts=[],skipped=[],mergedProjects=[];
  for(const [store,records] of Object.entries(rows)){
   ops[store]={add:[],put:[]};
   for(const incoming of records){
    const prior=await a.getRecord(store,incoming.id);
    if(!prior){ops[store].add.push(incoming);continue;}
    if(recordsEqual(store,prior,incoming)){skipped.push({store,id:String(incoming.id),reason:store==="projectMetadata"&&incoming.kind==="projects-workspace-manifest"?"manifest matches; createdAt ignored":"identical"});continue;}
    if(store==="projects"){
     try{
      const merged=mergeProjectIncome(prior,incoming);
      if(!sameValue(prior,merged)){ops[store].put.push(merged);mergedProjects.push(String(incoming.id));}
      else skipped.push({store,id:String(incoming.id),reason:"no changes"});
     }catch(e){conflicts.push({store,id:String(incoming.id),reason:e.message});}
    }else conflicts.push({store,id:String(incoming.id),reason:"Existing record differs; automatic merge is not permitted."});
   }
  }
  if(conflicts.length)throw new Error("Import stopped before writing because conflicts need review: "+conflicts.slice(0,8).map(c=>c.store+"/"+c.id+": "+c.reason).join(" | "));
  const total=Object.values(ops).reduce((n,g)=>n+g.add.length+g.put.length,0);
  if(!total)return {ok:true,atomic:true,added:0,updated:0,skipped,mergedProjects,appCutover:false,localStorageChanged:false,backupChanged:false};
  const r=await a.bulkWriteAcrossStores(ops);
  return {ok:true,atomic:r.atomic,added:r.added,updated:r.updated,skipped,mergedProjects,verification:r.verification,
   subprojects:x.projects.reduce((n,p)=>n+(Array.isArray(p.subprojects)?p.subprojects.length:0),0),
   appCutover:false,localStorageChanged:false,backupChanged:false};
 }
 async function importBackupFile(file){if(!file)throw Error("Select a backup JSON file");const b=JSON.parse(await file.text());if(!b||typeof b!=="object"||Array.isArray(b))throw Error("Invalid backup root");if(b.app!==undefined&&b.app!=="The Handyman Accountancy")throw Error("Backup belongs to another app");if(b.backupType!==undefined&&b.backupType!=="complete-user-data")throw Error("Unsupported backup type");return importWorkspace(b.projects);}
 async function readSummary(){
  const a=api(),o={ok:true,appCutover:false,stores:{}},allMeta=await a.getAllRecords("projectMetadata");
  for(const s of [...Object.values(map),"projectMetadata"]){
   const r=s==="projectMetadata"?allMeta:await a.getAllRecords(s);
   o.stores[s]={count:r.length,ids:r.map(x=>x.id)};
   if(s==="projectMetadata"){
    const expected=new Set([profileId,stateId,manifestId]);
    o.expectedMetadataCount=3;
    o.metadataRecords=r.map(x=>({id:x.id,kind:x.kind||null,keys:Object.keys(x).sort()}));
    o.unexpectedMetadataRecords=r.filter(x=>!expected.has(x.id)).map(x=>({id:x.id,kind:x.kind||null,keys:Object.keys(x).sort()}));
    o.metadataComplete=[profileId,stateId,manifestId].every(id=>r.some(x=>x.id===id));
    const legacy=r.find(x=>x.id==="projectMetadata"),profile=r.find(x=>x.id===profileId),state=r.find(x=>x.id===stateId);
    if(legacy){
     const legacyState={...legacy};delete legacyState.id;delete legacyState.profile;
     const legacyProfile=legacy.profile;
     const normalizedState=state&&state.value&&typeof state.value==="object"?state.value:{};
     const legacyKeys=Object.keys(legacyState).sort(),normalizedKeys=Object.keys(normalizedState).sort();
     o.legacyMetadataAudit={
      found:true,legacyKeys:Object.keys(legacy).sort(),
      legacyProfilePresent:legacyProfile!==undefined,
      normalizedProfilePresent:!!profile,
      legacyProfileMatchesNormalized:!!profile&&sameValue(legacyProfile,profile.value),
      legacyWorkspaceStateMatchesNormalized:!!state&&sameValue(legacyState,normalizedState),
      legacyStateOnlyKeys:legacyKeys.filter(k=>!normalizedKeys.includes(k)),
      normalizedStateOnlyKeys:normalizedKeys.filter(k=>!legacyKeys.includes(k)),
      differingStateKeys:[...new Set([...legacyKeys,...normalizedKeys])].filter(k=>!sameValue(legacyState[k],normalizedState[k]))
     };
    }else o.legacyMetadataAudit={found:false};
   }
  }
  const projects=await a.getAllRecords("projects");
  o.subprojects=projects.reduce((n,x)=>n+(Array.isArray(x.subprojects)?x.subprojects.length:0),0);
  o.incomeAudit=projects.map(project=>({projectId:project.id,subprojects:(Array.isArray(project.subprojects)?project.subprojects:[]).map(sub=>{const income=Array.isArray(sub.income)?sub.income:[];return {subprojectId:sub.id||null,incomeCount:income.length,incomeIds:income.map(item=>item&&item.id!==undefined?String(item.id):null),incomeAmountTotal:income.reduce((sum,item)=>{const n=Number(item&&item.amount);return sum+(Number.isFinite(n)?n:0);},0)};})}));
  o.totalIncomeRecords=o.incomeAudit.reduce((n,p)=>n+p.subprojects.reduce((m,s)=>m+s.incomeCount,0),0);
  o.manifest=o.stores.projectMetadata.ids.includes(manifestId);
  return o;
 }
 async function selfTest(){
  const suffix=Date.now()+"_"+Math.random().toString(36).slice(2),projectId="__tha_idb_project_test__"+suffix,workerId="__tha_idb_worker_test__"+suffix;
  const metaId="__tha_idb_meta_test__"+suffix,collisionProjectId="__tha_idb_collision_project__"+suffix,collisionWorkerId="__tha_idb_collision_worker__"+suffix,photo="data:image/jpeg;base64,"+"A".repeat(6*1024*1024);
  const fixture={projects:[{id:projectId,name:"Synthetic IndexedDB test",photo,subprojects:[{id:"sub-300",name:"Extra Job",price:300}]}],
   workers:[{id:workerId,name:"Synthetic worker"}],partners:[],contractors:[],companies:[],companyJobs:[],current:projectId,currentSubproject:"sub-300",guide:"fa"};
  const rows=prepare(fixture);rows.projectMetadata=rows.projectMetadata.filter(x=>x.id!==manifestId);
  rows.projectMetadata.push({id:metaId,kind:"test-fixture"});
  let committed=false;
  try{
   const result=await api().bulkAddAcrossStores(rows);committed=true;
   const p=await api().getRecord("projects",projectId);
   const state=await api().getRecord("projectMetadata",stateId);
   const manifestA={id:manifestId,kind:"projects-workspace-manifest",schema:1,counts:{projects:1},subprojectCount:1,createdAt:"2026-11-05T10:00:00.000Z"},manifestB={...manifestA,createdAt:"2026-11-06T10:00:00.000Z"},manifestC={...manifestB,subprojectCount:2};
   const checks={atomicWrite:result.atomic,photoPreserved:!!p&&p.photo===photo,subprojectAmountPreserved:!!p&&p.subprojects[0].price===300,workerPreserved:!!(await api().getRecord("workers",workerId)),workspaceStatePreserved:!!state&&state.value.current===projectId&&state.value.currentSubproject==="sub-300"&&state.value.guide==="fa",manifestIgnoresCreatedAt:recordsEqual("projectMetadata",manifestA,manifestB),manifestStillRejectsStructuralDifference:!recordsEqual("projectMetadata",manifestA,manifestC)};
   if(!checks.photoPreserved||!checks.subprojectAmountPreserved||!checks.workerPreserved||!checks.workspaceStatePreserved||!checks.manifestIgnoresCreatedAt||!checks.manifestStillRejectsStructuralDifference)throw Error("Normalized Projects self-test failed");
   const sentinel={id:collisionProjectId,marker:"existing-record-must-survive"};await api().putRecord("projects",sentinel);
   let collisionRejected=false;try{await api().bulkAddAcrossStores({projects:[{id:collisionProjectId,marker:"overwrite-attempt"}],workers:[{id:collisionWorkerId,name:"must-not-commit"}]});}catch(_){collisionRejected=true;}
   const afterCollision=await api().getRecord("projects",collisionProjectId),partial=await api().getRecord("workers",collisionWorkerId);
   checks.duplicateCollisionRejected=collisionRejected;checks.atomicRollbackOnCollision=!!afterCollision&&afterCollision.marker===sentinel.marker&&partial===null;
   await api().deleteRecord("projects",collisionProjectId);
   if(!checks.duplicateCollisionRejected||!checks.atomicRollbackOnCollision)throw Error("Atomic collision rollback test failed");
   const baseIncome=[{id:"income-a",amount:100},{id:"income-b",amount:200},{id:"income-c",amount:300}];
   const incomingIncome=[{id:"income-a",amount:100},{id:"income-b",amount:200},{id:"income-c",amount:300},{id:"income-d",amount:400}];
   const baseProject={id:"merge-project-test",subprojects:[{id:"merge-sub-test",name:"Synthetic",income:baseIncome}]};
   const incomingProject={id:"merge-project-test",subprojects:[{id:"merge-sub-test",name:"Synthetic",income:incomingIncome}]};
   const merged=mergeProjectIncome(baseProject,incomingProject),mergedIncome=merged.subprojects[0].income;
   checks.incomeMergeAddsOnlyMissing=mergedIncome.length===4&&mergedIncome.some(x=>x.id==="income-d"&&x.amount===400);
   checks.incomeMergePreservesExisting=mergedIncome.find(x=>x.id==="income-a").amount===100&&baseProject.subprojects[0].income.length===3;
   let incomeCollisionRejected=false;
   try{mergeProjectIncome(baseProject,{id:"merge-project-test",subprojects:[{id:"merge-sub-test",name:"Synthetic",income:[...incomingIncome,{id:"income-a",amount:999}]}]});}catch(_){incomeCollisionRejected=true;}
   checks.incomeCollisionRejected=incomeCollisionRejected;
   if(!checks.incomeMergeAddsOnlyMissing||!checks.incomeMergePreservesExisting||!checks.incomeCollisionRejected)throw Error("Income-level merge self-test failed");
   return {ok:true,checks,legacyLocalStorageChanged:false,liveDataChanged:false,appCutover:false,bytes:new Blob([JSON.stringify(fixture)]).size};
  }finally{
   if(committed){for(const [store,ids] of [["projects",[projectId,collisionProjectId]],["workers",[workerId,collisionWorkerId]],["projectMetadata",[stateId,metaId]]])for(const id of ids)await api().deleteRecord(store,id);}
  }
 }
 root.HandymanProjectsIDBRepository=Object.freeze({prepare,inspectBackupFile,importWorkspace,importBackupFile,readSummary,selfTest,stores:Object.values(map)});
})(window);
