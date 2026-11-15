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
 function create(engine,adapter,scopeName){
  if(!engine||!adapter)throw new Error("Storage engine and application adapter are required.");
  const DB=engine.databaseName;
  if(typeof DB!=="string"||!DB)throw new Error("Storage engine database identity is unavailable.");
  const SCOPES=Object.freeze({
   accounting:["accounting","sequences"],
   projects:["projects"],
   contracts:["contracts"],
   businessProfile:["business_profile"],
   support:["preferences","preference_meta","diagnostics","reports","report_notifications","report_settings","report_workflow","notifications","recovery","factory_reset_recovery","help_contact_drafts"],
   media:["media"]
  });
  if(!Object.prototype.hasOwnProperty.call(SCOPES,scopeName))throw new Error("A single supported application domain must be selected for backup or restore.");
  const allowed=SCOPES[scopeName].slice().sort();
  function assertScope(pkg){
   if(!pkg||pkg.format!==SNAPSHOT_FORMAT||pkg.database!==DB||!Array.isArray(pkg.domains)||!Array.isArray(pkg.records))throw new Error("Invalid v264 scoped backup.");
   const actual=[...pkg.domains].sort();
   if(actual.length!==allowed.length||actual.some((d,i)=>d!==allowed[i]))throw new Error("Backup does not match the selected independent domain: "+scopeName+".");
   for(const row of pkg.records)if(!row||!allowed.includes(row.domain))throw new Error("Backup contains a record outside the selected domain.");
   return pkg;
  }
  async function capture(){
   await adapter.initialize();
   const snapshot=assertScope(await adapter.backup(scopeName));
   const ids=new Set();
   for(const row of snapshot.records){
    const id=row.domain+":"+encodeURIComponent(row.key);
    if(row.id!==id||ids.has(id))throw new Error("Scoped backup contains an invalid or duplicate record identity.");
    ids.add(id);
   }
   return snapshot;
  }
  async function packageSnapshot(snapshot){
   assertScope(snapshot);
   const payload={format:SNAPSHOT_FORMAT,database:DB,scope:scopeName,createdAt:snapshot.createdAt,domains:snapshot.domains,records:[]};
   for(const row of snapshot.records)payload.records.push({id:row.id,domain:row.domain,key:row.key,value:await encode(row.value,new WeakSet())});
   const body=canonical(payload);
   return {format:FORMAT,algorithm:"SHA-256",digest:await digest(body),payload};
  }
  async function verifyPackage(pkg){
   if(!pkg||pkg.format!==FORMAT||pkg.algorithm!=="SHA-256"||typeof pkg.digest!=="string"||!pkg.payload)throw new Error("This is not a supported v264 domain backup.");
   const actual=await digest(canonical(pkg.payload));
   if(actual!==pkg.digest)throw new Error("Backup integrity check failed: SHA-256 does not match.");
   const p=pkg.payload;
   if(p.format!==SNAPSHOT_FORMAT||p.database!==DB||p.scope!==scopeName||!Array.isArray(p.domains)||!Array.isArray(p.records))throw new Error("Backup scope or database identity is invalid.");
   const domains=[...p.domains].sort();
   if(domains.length!==allowed.length||domains.some((d,i)=>d!==allowed[i]))throw new Error("Backup belongs to a different independent domain.");
   const ids=new Set();
   for(const row of p.records){
    if(!row||typeof row.domain!=="string"||typeof row.key!=="string"||!allowed.includes(row.domain))throw new Error("Backup contains a record outside its selected domain.");
    const id=row.domain+":"+encodeURIComponent(row.key);
    if(row.id!==id||ids.has(id))throw new Error("Backup record identity is invalid or duplicated.");
    ids.add(id);
   }
   return {ok:true,scope:scopeName,algorithm:"SHA-256",digest:actual,domains:domains.length,records:p.records.length,createdAt:p.createdAt};
  }
  async function createBackup(){
   const snapshot=await capture(),pkg=await packageSnapshot(snapshot);
   const check=await verifyPackage(pkg);
   if(check.records!==snapshot.records.length)throw new Error("Domain backup record-count verification failed.");
   const blob=new Blob([JSON.stringify(pkg)],{type:"application/vnd.thehandyman.v264-domain-backup+json"});
   return {ok:true,blob,filename:"THA-v264-"+scopeName+"-backup-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",verification:check};
  }
  async function readFile(file){
   if(!file||typeof file.text!=="function")throw new Error("Select a valid domain backup file from the Files app.");
   let pkg;try{pkg=JSON.parse(await file.text());}catch(_){throw new Error("The selected file is not valid backup JSON.");}
   const verification=await verifyPackage(pkg),records=[];
   for(const row of pkg.payload.records)records.push({domain:row.domain,key:row.key,value:await decode(row.value)});
   return {pkg,verification,snapshot:{format:SNAPSHOT_FORMAT,database:DB,createdAt:pkg.payload.createdAt,domains:pkg.payload.domains,records}};
  }
  async function inspectFile(file){const parsed=await readFile(file);return {ok:true,...parsed.verification};}
  async function restoreFromFile(file){
   const parsed=await readFile(file);
   const result=await adapter.restore(scopeName,parsed.snapshot);
   const after=assertScope(await adapter.backup(scopeName));
   const afterPkg=await packageSnapshot(after);
   const afterData={...afterPkg.payload};delete afterData.createdAt;
   const expectedData={...parsed.pkg.payload};delete expectedData.createdAt;
   if(await digest(canonical(afterData))!==await digest(canonical(expectedData)))throw new Error("Scoped restore verification failed: restored records do not exactly match the selected backup.");
   return {ok:true,restored:result.restored??after.records.length,domains:allowed.length,verified:true,scope:scopeName};
  }
  async function createFullBackup(){
   const domains=["accounting","business_profile","contracts","diagnostics","factory_reset_recovery","help_contact_drafts","media","notifications","preference_meta","preferences","projects","recovery","report_notifications","report_settings","report_workflow","reports","sequences"].sort();
   const snapshot=await engine.snapshot(domains);
   if(!snapshot||snapshot.database!==DB||snapshot.domains.slice().sort().join("|")!==domains.join("|")||!Array.isArray(snapshot.records))throw new Error("Full database snapshot validation failed.");
   const ids=new Set();
   for(const row of snapshot.records){
    if(!row||!domains.includes(row.domain)||typeof row.key!=="string")throw new Error("Full backup contains an invalid domain record.");
    const id=row.domain+":"+encodeURIComponent(row.key);
    if(row.id!==id||ids.has(id))throw new Error("Full backup contains an invalid or duplicate record identity.");
    ids.add(id);
   }
   const payload={format:SNAPSHOT_FORMAT,database:DB,scope:"full-database",createdAt:snapshot.createdAt,domains,records:[]};
   for(const row of snapshot.records)payload.records.push({id:row.id,domain:row.domain,key:row.key,value:await encode(row.value,new WeakSet())});
   const body=canonical(payload),hash=await digest(body);
   const pkg={format:FORMAT,algorithm:"SHA-256",digest:hash,payload};
   const verify=await digest(canonical(pkg.payload));
   if(verify!==pkg.digest||pkg.payload.records.length!==snapshot.records.length)throw new Error("Full backup integrity or record-count verification failed.");
   const blob=new Blob([JSON.stringify(pkg)],{type:"application/vnd.thehandyman.v264-full-backup+json"});
   return {ok:true,blob,verification:{ok:true,scope:"full-database",domains:domains.length,records:snapshot.records.length,digest:hash,createdAt:snapshot.createdAt},filename:"THA-v264-full-database-backup-"+new Date().toISOString().replace(/[:.]/g,"-")+".json"};
  }
  async function downloadBackup(){
   const result=await createBackup(),url=URL.createObjectURL(result.blob),a=root.document.createElement("a");
   a.href=url;a.download=result.filename;a.style.display="none";root.document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   return {ok:true,scope:scopeName,filename:result.filename,verification:result.verification,instructions:"Save this domain-specific file in the iPhone Files app. Restore it only with the same domain selected."};
  }
  async function resetFromBackupFile(){throw new Error("Global Factory Reset is disabled. Domain backups can restore only their selected domain.");}
  return Object.freeze({scope:scopeName,domains:allowed,createBackup,createFullBackup,downloadBackup,inspectFile,restoreFromFile,resetFromBackupFile,verifyPackage});
 }
 const FULL_DOMAINS=["accounting","business_profile","contracts","diagnostics","factory_reset_recovery","help_contact_drafts","media","notifications","preference_meta","preferences","projects","recovery","report_notifications","report_settings","report_workflow","reports","sequences"].sort();
 async function createFullBackup(){
  const engine=root.HandymanStorageV264;if(!engine)throw new Error("IndexedDB engine unavailable.");
  await engine.ready();
  const snapshot=await engine.snapshot(FULL_DOMAINS);
  if(!snapshot||snapshot.database!==engine.databaseName||snapshot.domains.slice().sort().join("|")!==FULL_DOMAINS.join("|")||!Array.isArray(snapshot.records))throw new Error("Full database snapshot validation failed.");
  const ids=new Set(),payload={format:SNAPSHOT_FORMAT,database:engine.databaseName,scope:"full-database",createdAt:snapshot.createdAt,domains:FULL_DOMAINS,records:[]};
  for(const row of snapshot.records){
   if(!row||!FULL_DOMAINS.includes(row.domain)||typeof row.key!=="string"||row.id!==row.domain+":"+encodeURIComponent(row.key)||ids.has(row.id))throw new Error("Invalid or duplicate database record.");
   ids.add(row.id);payload.records.push({id:row.id,domain:row.domain,key:row.key,value:await encode(row.value,new WeakSet())});
  }
  const hash=await digest(canonical(payload)),pkg={format:FORMAT,algorithm:"SHA-256",digest:hash,payload};
  if(await digest(canonical(pkg.payload))!==pkg.digest)throw new Error("Full backup SHA-256 verification failed.");
  const blob=new Blob([JSON.stringify(pkg)],{type:"application/vnd.thehandyman.v264-full-backup+json"});
  return {ok:true,blob,filename:"The-Handyman-Full-Database-Backup.json",verification:{ok:true,scope:"full-database",domains:FULL_DOMAINS.length,records:payload.records.length,digest:hash,createdAt:snapshot.createdAt}};
 }
 async function readFullBackup(file){
  if(!file||typeof file.text!=="function")throw new Error("Choose a full database backup JSON file.");
  let pkg;try{pkg=JSON.parse(await file.text())}catch(_){throw new Error("The selected file is not valid JSON.")};
  if(!pkg||pkg.format!==FORMAT||pkg.algorithm!=="SHA-256"||!pkg.payload||typeof pkg.digest!=="string")throw new Error("Unsupported full backup format.");
  if(await digest(canonical(pkg.payload))!==pkg.digest)throw new Error("Backup integrity check failed: SHA-256 mismatch.");
  const p=pkg.payload,engine=root.HandymanStorageV264;
  if(!engine||p.format!==SNAPSHOT_FORMAT||p.database!==engine.databaseName||p.scope!=="full-database"||!Array.isArray(p.domains)||p.domains.slice().sort().join("|")!==FULL_DOMAINS.join("|")||!Array.isArray(p.records))throw new Error("Backup is not a complete database backup for this app.");
  const ids=new Set(),records=[];
  for(const row of p.records){
   if(!row||!FULL_DOMAINS.includes(row.domain)||typeof row.key!=="string"||row.id!==row.domain+":"+encodeURIComponent(row.key)||ids.has(row.id))throw new Error("Backup has an invalid or duplicate record.");
   ids.add(row.id);records.push({domain:row.domain,key:row.key,value:await decode(row.value)});
  }
  return {pkg,snapshot:{format:SNAPSHOT_FORMAT,database:p.database,createdAt:p.createdAt,domains:FULL_DOMAINS,records},verification:{ok:true,domains:FULL_DOMAINS.length,records:records.length,digest:pkg.digest,createdAt:p.createdAt}};
 }
 async function restoreFullBackup(file){
  const parsed=await readFullBackup(file),engine=root.HandymanStorageV264;
  let health=await engine.health();
  if(health.resetLocked){
   if(health.resetLockPhase!=="recovery")throw new Error("Database has a pre-clear reset lock. Stop and inspect recovery state; no data was changed by this restore attempt.");
  }else{
   await engine.beginResetLock();
   await engine.clearWhileResetLocked();
  }
  const restored=await engine.restore(parsed.snapshot);
  if(!restored||restored.ok!==true||restored.fullRecovery!==true)throw new Error("Full database restore did not complete.");
  const completed=await engine.completeRecovery(parsed.snapshot);
  if(!completed||completed.ok!==true||completed.unlocked!==true)throw new Error("Restored data was written, but recovery verification did not unlock the database. Keep this backup file.");
  const final=await engine.health();
  if(!final.ok||final.resetLocked||final.totalRecords!==parsed.snapshot.records.length)throw new Error("Final database health or record count does not match the selected backup.");
  return {ok:true,verified:true,domains:FULL_DOMAINS.length,records:final.totalRecords,counts:final.counts};
 }
 const engine=()=>root.HandymanStorageV264,adapter=()=>root.HandymanAppStorageV264;
 root.HandymanRecoveryV264=Object.freeze({build:"THA-264-FULL-RECOVERY-2",create:scopeName=>create(engine(),adapter(),scopeName),createFullBackup,readFullBackup,restoreFullBackup,createWithDependencies:create});
})(window);
