/* THA v250 — guarded typed-domain backup importer.
   No LocalStorage access. Prepare is read-only for business data.
   Apply requires a fresh pre-import snapshot download acknowledgement and exact phrase.
*/
(function(root){
 "use strict";
 const DB_DOMAINS=["accounting","projects","contracts"];
 const TARGETS=[
  {domain:"accounting",key:"main",source:"data"},
  {domain:"projects",key:"main",source:"projects"},
  {domain:"contracts",key:"main",source:"contracts"}
 ];
 let plan=null;
 const canonical=value=>{
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  return JSON.stringify(value);
 };
 async function sha256Text(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await root.crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
 }
 const clone=value=>JSON.parse(JSON.stringify(value));
 async function prepare(file){
  if(plan&&!plan.applied)throw new Error("A migration plan is already prepared. Refresh the page before preparing another.");
  if(!file)throw new Error("Select New_new(1).json first.");
  const repo=root.HandymanStorageRepository,audit=root.HandymanV250BackupAudit;
  if(!repo||!audit)throw new Error("Required v250 repository or backup audit module is not loaded.");
  const auditResult=await audit.inspectFile(file);
  if(!auditResult.ok||!auditResult.summary||!auditResult.summary.sourceHashMatches)
   throw new Error("The selected backup did not pass the exact source authority check.");
  const text=await file.text(),backup=JSON.parse(text);
  if(backup.backupType!=="complete-user-data"||!backup.data||!backup.projects||!Array.isArray(backup.contracts))
   throw new Error("Backup structure changed after audit; refusing to prepare.");
  await repo.ready();
  const [health,legacyBefore,targetRead]=await Promise.all([
   repo.health(),repo.snapshot(["legacy"]),repo.readMany(TARGETS.map(({domain,key})=>({domain,key})))
  ]);
  if(legacyBefore.records.length!==40)
   throw new Error("Expected exactly 40 staged legacy keys; found "+legacyBefore.records.length+". No import prepared.");
  const occupied=targetRead.records.filter(x=>x.value!==null);
  if(occupied.length)
   throw new Error("Target records already exist; refusing to overwrite: "+occupied.map(x=>x.domain+"/"+x.key).join(", "));
  const preSnapshot=await repo.snapshot(DB_DOMAINS);
  const expected=auditResult.summary.payloadManifest;
  if(!Array.isArray(expected)||expected.length!==3)
   throw new Error("The audit did not return all three payload hashes.");
  const phrase="IMPORT "+auditResult.summary.sha256.slice(0,8).toUpperCase();
  plan={
   sourceHash:auditResult.summary.sha256,
   backup: {data:backup.data,projects:backup.projects,contracts:backup.contracts},
   expected,
   preSnapshot,
   legacyBefore:legacyBefore.records,
   phrase,
   preparedAt:new Date().toISOString(),
   applied:false,
   summary:{
    sourceFile:file.name,
    sourceHash:auditResult.summary.sha256,
    targetRecords:TARGETS.map(x=>({domain:x.domain,key:x.key})),
    legacyKeysPreserved:legacyBefore.records.length,
    preImportTypedRecords:preSnapshot.records.length,
    nestedCounts:expected.map(x=>({source:x.source,...x.nestedCounts})),
    writesPerformed:false,
    localStorageChanged:false,
    appCutover:false
   }
  };
  return getState();
 }
 function getState(){
  if(!plan)return null;
  return {
   prepared:true,applied:plan.applied,
   summary:clone(plan.summary),
   confirmationPhrase:plan.phrase,
   preImportSnapshot:clone(plan.preSnapshot),
   expectedPayloadHashes:plan.expected.map(x=>({source:x.source,destination:x.destination,canonicalBytes:x.canonicalBytes,canonicalSha256:x.canonicalSha256}))
  };
 }
 async function apply(options){
  if(!plan||plan.applied)throw new Error("Prepare a migration plan before applying it.");
  options=options||{};
  if(options.phrase!==plan.phrase)throw new Error("Confirmation phrase does not match. No data was written.");
  if(options.ackSnapshotDownloaded!==true)throw new Error("Confirm that the pre-import IndexedDB snapshot has been downloaded. No data was written.");
  const repo=root.HandymanStorageRepository;
  const latestLegacy=await repo.snapshot(["legacy"]);
  if(canonical(latestLegacy.records)!==canonical(plan.legacyBefore))
   throw new Error("Legacy keys changed after preparation. No typed-domain write was attempted.");
  const currentTargets=await repo.readMany(TARGETS.map(({domain,key})=>({domain,key})));
  if(currentTargets.records.some(x=>x.value!==null))
   throw new Error("A destination record appeared after preparation. No typed-domain write was attempted.");
  let writeStarted=false;
  try{
   const write=await repo.mutateMany(TARGETS.map(x=>({domain:x.domain,key:x.key,initialValue:null})),current=>{
    if(current.some(x=>x.value!==null))
     throw new Error("A target record appeared immediately before commit; refusing to overwrite.");
    return [clone(plan.backup.data),clone(plan.backup.projects),clone(plan.backup.contracts)];
   });
   if(!write.ok)throw new Error("Atomic typed-domain write did not report success.");
   writeStarted=true;
   const readback=await repo.readMany(TARGETS.map(({domain,key})=>({domain,key})));
   const actual=[];
   for(let i=0;i<TARGETS.length;i++){
    const target=TARGETS[i],record=readback.records[i];
    if(!record||record.value===null)throw new Error("Missing read-back record: "+target.domain+"/"+target.key);
    actual.push({source:target.source,destination:{domain:target.domain,key:target.key},canonicalSha256:await sha256Text(canonical(record.value))});
   }
   for(let i=0;i<actual.length;i++){
    if(actual[i].canonicalSha256!==plan.expected[i].canonicalSha256)
     throw new Error("Payload hash mismatch after write for "+actual[i].source);
   }
   const legacyAfter=await repo.snapshot(["legacy"]);
   if(canonical(legacyAfter.records)!==canonical(plan.legacyBefore))
    throw new Error("Legacy-domain preservation check failed after typed-domain write.");
   plan.applied=true;
   plan.summary={
    ...plan.summary,
    writesPerformed:true,
    atomicWrite:true,
    readBackVerified:true,
    payloadHashesVerified:true,
    legacyKeysPreservedAfterWrite:legacyAfter.records.length,
    localStorageChanged:false,
    appCutover:false,
    completedAt:new Date().toISOString()
   };
   return {ok:true,summary:clone(plan.summary),readback:actual,rollbackPerformed:false,appCutover:false};
  }catch(error){
   if(writeStarted){
    try{
     for(const target of TARGETS)await repo.remove(target.domain,target.key);
     const removed=await repo.readMany(TARGETS.map(({domain,key})=>({domain,key})));
     if(removed.records.some(x=>x.value!==null))
      throw new Error("Target-record rollback verification failed.");
     const legacyAfterRollback=await repo.snapshot(["legacy"]);
     if(canonical(legacyAfterRollback.records)!==canonical(plan.legacyBefore))
      throw new Error("Legacy preservation check failed during rollback.");
     return {ok:false,error:String(error&&error.message||error),rollbackPerformed:true,rollbackVerified:true,onlyNewTargetRecordsRemoved:true,localStorageChanged:false,appCutover:false};
    }catch(rollbackError){
     return {ok:false,error:String(error&&error.message||error),rollbackPerformed:true,rollbackVerified:false,rollbackError:String(rollbackError&&rollbackError.message||rollbackError),manualInspectionRequired:true,localStorageChanged:false,appCutover:false};
    }
   }
   throw error;
  }
 }
 root.HandymanV250BackupImporter=Object.freeze({prepare,apply,getState});
})(window);
