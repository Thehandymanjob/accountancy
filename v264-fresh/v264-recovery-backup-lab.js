/* THA v264 portable backup / restore / factory reset.
   Export is a standalone file. Reset is fail-closed and requires re-selecting that file.
   IndexedDB records are never cleared by merely creating or downloading a backup.
*/
(function(root){
 "use strict";
 const FORMAT="tha-v264-portable-backup-v1";
 const SNAPSHOT_FORMAT="tha-v264-indexeddb-snapshot-v1";

 const bytesToBase64=bytes=>{
  let binary="";
  const step=0x8000;
  for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+step,bytes.length)));
  return btoa(binary);
 };
 const base64ToBytes=value=>{
  if(typeof value!=="string"||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error("Invalid base64 binary data in backup.");
  const binary=atob(value),out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
 };
 async function encode(value,seen){
  if(value===null||typeof value==="string"||typeof value==="boolean"||typeof value==="number")return value;
  if(typeof value==="undefined")return {$tha:"Undefined"};
  if(typeof value==="bigint")return {$tha:"BigInt",value:String(value)};
  if(typeof value==="function"||typeof value==="symbol")throw new Error("Backup contains an unsupported function or symbol.");
  if(seen.has(value))throw new Error("Backup contains a circular reference; export stopped to prevent data loss.");
  seen.add(value);
  try{
   if(value instanceof Date)return {$tha:"Date",value:value.toISOString()};
   if(typeof root.File!=="undefined"&&value instanceof root.File){
    const data=new Uint8Array(await value.arrayBuffer());
    return {$tha:"File",name:value.name,type:value.type,lastModified:value.lastModified,data:bytesToBase64(data)};
   }
   if(value instanceof Blob){
    const data=new Uint8Array(await value.arrayBuffer());
    return {$tha:"Blob",type:value.type,data:bytesToBase64(data)};
   }
   if(value instanceof ArrayBuffer)return {$tha:"ArrayBuffer",data:bytesToBase64(new Uint8Array(value))};
   if(ArrayBuffer.isView(value)){
    const name=value.constructor.name;
    const allowed=["Int8Array","Uint8Array","Uint8ClampedArray","Int16Array","Uint16Array","Int32Array","Uint32Array","Float32Array","Float64Array","BigInt64Array","BigUint64Array","DataView"];
    if(!allowed.includes(name))throw new Error("Unsupported typed array in backup: "+name);
    return {$tha:"TypedArray",type:name,data:bytesToBase64(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))};
   }
   if(Array.isArray(value))return await Promise.all(value.map(v=>encode(v,seen)));
   const proto=Object.getPrototypeOf(value);
   if(proto!==Object.prototype&&proto!==null)throw new Error("Unsupported object type in backup: "+(value.constructor&&value.constructor.name||"unknown"));
   const out={};
   for(const key of Object.keys(value))out[key]=await encode(value[key],seen);
   return out;
  }finally{seen.delete(value);}
 }
 async function decode(value){
  if(value===null||typeof value!=="object")return value;
  if(Array.isArray(value))return Promise.all(value.map(decode));
  if(value.$tha){
   const tag=value.$tha;
   if(tag==="Undefined")return undefined;
   if(tag==="BigInt")return BigInt(value.value);
   if(tag==="Date"){const d=new Date(value.value);if(!Number.isFinite(d.getTime()))throw new Error("Invalid Date in backup.");return d;}
   if(tag==="Blob")return new Blob([base64ToBytes(value.data)],{type:value.type||""});
   if(tag==="File"){
    if(typeof root.File!=="function")throw new Error("This browser cannot restore File objects.");
    return new File([base64ToBytes(value.data)],String(value.name||"file"),{type:value.type||"",lastModified:Number(value.lastModified)||0});
   }
   if(tag==="ArrayBuffer")return base64ToBytes(value.data).buffer;
   if(tag==="TypedArray"){
    const bytes=base64ToBytes(value.data),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const constructors={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,DataView};
    if(typeof BigInt64Array!=="undefined")constructors.BigInt64Array=BigInt64Array;
    if(typeof BigUint64Array!=="undefined")constructors.BigUint64Array=BigUint64Array;
    const C=constructors[value.type];if(!C)throw new Error("Unsupported typed array constructor in backup.");
    if(value.type!=="DataView"&&buffer.byteLength%C.BYTES_PER_ELEMENT!==0)throw new Error("Typed array byte length is invalid.");
    return new C(buffer);
   }
   throw new Error("Unknown tagged value in backup: "+tag);
  }
  const out={};for(const key of Object.keys(value))out[key]=await decode(value[key]);return out;
 }
 async function digest(text){
  if(!root.crypto||!root.crypto.subtle)throw new Error("SHA-256 verification is unavailable in this browser; backup operation is blocked.");
  const hash=await root.crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
 }
 const canonical=value=>JSON.stringify(value);
 function create(engine,adapter){
  if(!engine||!adapter)throw new Error("Storage engine and application adapter are required.");
  const DB=engine.databaseName;
  if(typeof DB!=="string"||!DB)throw new Error("Storage engine database identity is unavailable.");
  async function capture(){
   await adapter.initialize();
   const status=await engine.health();
   const appDomains=adapter.domains;
   if(!Array.isArray(appDomains)||!appDomains.length)throw new Error("Application adapter domain registry is unavailable.");
   // Explicit physical IndexedDB stores. Never ask the adapter for a cross-domain backup:
   // the adapter deliberately permits only one domain per backup call.
   const domains=[
    "accounting","projects","contracts","business_profile","sequences",
    "preferences","preference_meta","diagnostics","reports","report_notifications",
    "report_settings","report_workflow","notifications","recovery","factory_reset_recovery"
   ];
   const snapshot=await engine.snapshot(domains);
   if(!snapshot||!Array.isArray(snapshot.records)||snapshot.records.length!==status.totalRecords)throw new Error("Backup completeness check failed: database record count changed during capture.");
   const unexpected=snapshot.records.some(row=>!domains.includes(row.domain));
   if(unexpected)throw new Error("Backup contains a record outside the registered v264 application domains.");
   return {format:SNAPSHOT_FORMAT,database:DB,createdAt:snapshot.createdAt,domains:snapshot.domains,records:snapshot.records};
  }
  async function packageSnapshot(snapshot){
   const payload={format:SNAPSHOT_FORMAT,database:DB,createdAt:snapshot.createdAt,domains:snapshot.domains,records:[]};
   for(const row of snapshot.records)payload.records.push({id:row.id,domain:row.domain,key:row.key,value:await encode(row.value,new WeakSet())});
   const body=canonical(payload);
   return {format:FORMAT,algorithm:"SHA-256",digest:await digest(body),payload};
  }
  async function verifyPackage(pkg){
   if(!pkg||pkg.format!==FORMAT||pkg.algorithm!=="SHA-256"||typeof pkg.digest!=="string"||!pkg.payload)throw new Error("This is not a supported v264 portable backup.");
   const actual=await digest(canonical(pkg.payload));
   if(actual!==pkg.digest)throw new Error("Backup integrity check failed: SHA-256 does not match.");
   const p=pkg.payload;
   if(p.format!==SNAPSHOT_FORMAT||p.database!==DB||!Array.isArray(p.domains)||!Array.isArray(p.records))throw new Error("Backup structure or database identity is invalid.");
   const domains=[...new Set(p.domains)];
   if(domains.length!==p.domains.length||domains.some(d=>typeof d!=="string"||!/^[a-z][a-z0-9_-]{0,63}$/.test(d)))throw new Error("Backup domain list is invalid.");
   const ids=new Set();
   for(const row of p.records){
    if(!row||typeof row.domain!=="string"||typeof row.key!=="string"||!domains.includes(row.domain))throw new Error("Backup contains a record outside its declared domains.");
    const id=row.domain+":"+encodeURIComponent(row.key);
    if(row.id!==id||ids.has(id))throw new Error("Backup record identity is invalid or duplicated.");
    ids.add(id);
   }
   return {ok:true,digest:actual,domains:domains.length,records:p.records.length,createdAt:p.createdAt};
  }
  async function createBackup(){
   const snapshot=await capture(),pkg=await packageSnapshot(snapshot);
   const check=await verifyPackage(pkg);
   if(check.records!==snapshot.records.length)throw new Error("Backup record count verification failed.");
   const blob=new Blob([JSON.stringify(pkg)],{type:"application/vnd.thehandyman.v264-backup+json"});
   return {ok:true,blob,filename:"THA-v264-backup-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",verification:check};
  }
  async function readFile(file){
   if(!file||typeof file.text!=="function")throw new Error("Select a valid backup file from the Files app.");
   let pkg;try{pkg=JSON.parse(await file.text());}catch(_){throw new Error("The selected file is not valid backup JSON.");}
   const verification=await verifyPackage(pkg),records=[];
   for(const row of pkg.payload.records)records.push({domain:row.domain,key:row.key,value:await decode(row.value)});
   return {pkg,verification,snapshot:{format:SNAPSHOT_FORMAT,database:DB,createdAt:pkg.payload.createdAt,domains:pkg.payload.domains,records}};
  }
  async function inspectFile(file){const parsed=await readFile(file);return {ok:true,...parsed.verification};}
  async function restoreFromFile(file){
   const parsed=await readFile(file);
   const result=await engine.restore(parsed.snapshot);
   const after=await engine.snapshot(parsed.snapshot.domains);
   const afterPkg=await packageSnapshot(after);
   const afterData={...afterPkg.payload};delete afterData.createdAt;
   const expectedData={...parsed.pkg.payload};delete expectedData.createdAt;
   if(await digest(canonical(afterData))!==await digest(canonical(expectedData)))throw new Error("Restore verification failed: restored records do not exactly match the selected backup.");
   const health=await engine.health();
   if(health.resetLocked){if(typeof engine.completeRecovery!=="function")throw new Error("Full recovery completion API is unavailable; database remains locked.");await engine.completeRecovery(parsed.snapshot);}
   return {ok:true,restored:result.restored,domains:result.domains.length,verified:true,recoveryCompleted:health.resetLocked};
  }
  async function resetFromBackupFile(file){
   const parsed=await readFile(file);
   const current=await capture();
   const currentPkg=await packageSnapshot(current);
   const currentData={...currentPkg.payload};delete currentData.createdAt;const backupData={...parsed.pkg.payload};delete backupData.createdAt;if(await digest(canonical(currentData))!==await digest(canonical(backupData)))throw new Error("Factory Reset blocked: the selected backup is not an exact snapshot of the current database. Create and save a fresh backup, then select that file.");
   // Close the time-of-check/time-of-use race: acquire the persistent lock first,
   // then compare the current database while all normal write paths are blocked.
   if(typeof engine.beginResetLock!=="function"||typeof engine.clearWhileResetLocked!=="function")throw new Error("Factory Reset blocked: lock-first reset APIs are unavailable.");
   const locked=await engine.beginResetLock();
   if(!locked||locked.ok!==true||locked.locked!==true)throw new Error("Factory Reset blocked: persistent lock could not be verified.");
   let lockedSnapshot;
   try {
    lockedSnapshot=await capture();
    const lockedPkg=await packageSnapshot(lockedSnapshot);
    const lockedData={...lockedPkg.payload};delete lockedData.createdAt;
    const selectedData={...parsed.pkg.payload};delete selectedData.createdAt;
    const stillExact=await digest(canonical(lockedData))===await digest(canonical(selectedData));
    if(!stillExact){
     await engine.releaseResetLock();
     throw new Error("Factory Reset cancelled: database changed before the reset lock was acquired. No records were cleared; create a fresh backup and retry.");
    }
    const cleared=await engine.clearWhileResetLocked();
    if(!cleared||cleared.ok!==true||cleared.locked!==true||cleared.remainingRecords!==0)throw new Error("Factory Reset failed: locked database clear was not verified.");
    const health=await engine.health();
    if(health.totalRecords!==0)throw new Error("Factory Reset verification failed: records remain in IndexedDB.");
    return {ok:true,clearedRecords:lockedSnapshot.records.length,remainingRecords:0,domains:lockedSnapshot.domains.length,backupDigest:parsed.pkg.digest,resetLocked:true,recoveryRequired:true,lockedSnapshotVerified:true};
   } catch(error) {
    // Preserve the lock on unexpected errors. A valid backup restore is the recovery route.
    throw error;
   }
  }
  async function downloadBackup(){
   const result=await createBackup(),url=URL.createObjectURL(result.blob),a=root.document.createElement("a");
   a.href=url;a.download=result.filename;a.style.display="none";root.document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   return {ok:true,filename:result.filename,verification:result.verification,instructions:"Save this downloaded file in the iPhone Files app. To authorize Factory Reset, select that same saved file in the reset screen."};
  }
  return Object.freeze({createBackup,downloadBackup,inspectFile,restoreFromFile,resetFromBackupFile,verifyPackage});
 }
 const engine=()=>root.HandymanStorageV264BackupLab,adapter=()=>root.HandymanAppStorageV264BackupLab;
 root.HandymanRecoveryV264BackupLab=Object.freeze({build:"THA-264-RECOVERY-GUARD-LAB-2",create:()=>create(engine(),adapter()),createWithDependencies:create});
})(window);
