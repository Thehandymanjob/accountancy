/* THA v250 — non-destructive LocalStorage capture into the v250 repository.
   Copies every same-origin LocalStorage key as an exact raw string into domain
   "legacy". It never writes/deletes LocalStorage and never enables app cutover.
*/
(function(root){
 "use strict";
 const DOMAIN="legacy";
 const FORMAT="tha-legacy-localstorage-value-v1";
 const MAX_KEY_LENGTH=512;

 function repository(){
  const api=root.HandymanStorageRepository;
  if(!api||typeof api.readMany!=="function"||typeof api.mutateMany!=="function"||
     typeof api.snapshot!=="function"||api.databaseName!=="the_handyman_accountancy_v250_idb"){
   throw new Error("The verified v250 Storage Repository is not loaded.");
  }
  return api;
 }

 function readSource(){
  const rows=[];
  for(let i=0;i<root.localStorage.length;i++){
   const key=root.localStorage.key(i);
   if(key===null)continue;
   rows.push({key,raw:root.localStorage.getItem(key)});
  }
  rows.sort((a,b)=>a.key.localeCompare(b.key));
  const seen=new Set();
  for(const row of rows){
   if(typeof row.key!=="string"||row.key.length===0||row.key.length>MAX_KEY_LENGTH)
    throw new Error("A LocalStorage key is empty or exceeds the repository's 512-character key limit.");
   if(typeof row.raw!=="string")throw new Error("A LocalStorage value could not be read as a string: "+row.key);
   if(seen.has(row.key))throw new Error("Duplicate LocalStorage key encountered: "+row.key);
   seen.add(row.key);
  }
  return rows;
 }

 async function sha256(raw){
  try{
   if(!root.crypto||!root.crypto.subtle||!root.TextEncoder)return null;
   const digest=await root.crypto.subtle.digest("SHA-256",new root.TextEncoder().encode(raw));
   return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
  }catch(_){return null;}
 }

 async function inspect(){
  const api=repository();
  const source=readSource();
  if(!source.length)return {
   ok:true,database:api.databaseName,sourceKeyCount:0,identical:0,missing:0,conflicts:[],
   sourceKeys:[],localStorageChanged:false,indexedDBChanged:false,appCutover:false
  };
  const descriptors=source.map(row=>({domain:DOMAIN,key:row.key}));
  const target=await api.readMany(descriptors);
  if(!target||target.ok!==true||!Array.isArray(target.records)||target.records.length!==source.length)
   throw new Error("Repository read-back returned an incomplete key list.");
  let identical=0,missing=0;
  const conflicts=[],sourceKeys=[];
  for(let i=0;i<source.length;i++){
   const incoming=source[i],existing=target.records[i].value;
   let validJson=true;
   try{JSON.parse(incoming.raw)}catch(_){validJson=false;}
   const hash=await sha256(incoming.raw);
   const expected={format:FORMAT,sourceKey:incoming.key,raw:incoming.raw};
   let state;
   if(existing===null){missing++;state="missing";}
   else if(existing&&existing.format===FORMAT&&existing.sourceKey===incoming.key&&existing.raw===incoming.raw){
    identical++;state="identical";
   }else{
    conflicts.push({key:incoming.key,reason:"A different value already exists in the v250 legacy domain; it will not be overwritten."});
    state="conflict";
   }
   sourceKeys.push({key:incoming.key,bytes:new Blob([incoming.raw]).size,validJson,sha256:hash,state});
  }
  return {
   ok:conflicts.length===0,
   database:api.databaseName,
   sourceKeyCount:source.length,
   identical,missing,conflicts,sourceKeys,
   writeRequired:missing>0,
   localStorageChanged:false,indexedDBChanged:false,appCutover:false,
   note:"Read-only inspection. Existing v250 records are never overwritten."
  };
 }

 async function stage(){
  const api=repository();
  const before=readSource();
  const initial=await inspect();
  if(!initial.ok)throw new Error("Migration stopped: conflicting v250 legacy records must be reviewed before any write.");
  if(!before.length)return {...initial,staged:false,written:0};
  const descriptors=before.map(row=>({
   domain:DOMAIN,key:row.key,
   initialValue:{format:FORMAT,sourceKey:row.key,raw:null,present:false}
  }));
  const result=await api.mutateMany(descriptors,current=>current.map((item,index)=>{
   const source=before[index],existing=item.value;
   if(existing&&existing.format===FORMAT&&existing.sourceKey===source.key&&existing.raw===source.raw)
    return existing;
   if(existing&&existing.present===false&&existing.format===FORMAT&&existing.sourceKey===source.key)
    return {format:FORMAT,sourceKey:source.key,raw:source.raw};
   throw new Error("Migration conflict; refusing to overwrite legacy/"+source.key);
  }));
  const after=await inspect();
  const sourceAfter=readSource();
  const sourceUnchanged=sourceAfter.length===before.length&&sourceAfter.every((row,index)=>
   row.key===before[index].key&&row.raw===before[index].raw);
  const verified=after.ok&&after.identical===before.length&&after.missing===0&&sourceUnchanged;
  return {
   ok:verified,
   staged:true,
   atomic:result.ok===true,
   written:result.updated,
   verifiedKeys:after.identical,
   missingAfter:after.missing,
   conflictsAfter:after.conflicts,
   sourceUnchanged,
   localStorageChanged:false,
   appCutover:false,
   note:verified
    ?"Exact raw-value copy verified in the v250 IndexedDB repository. Original LocalStorage remains untouched."
    :"The source or destination changed during verification. Do not cut over; inspect the report and preserve both copies."
  };
 }

 async function snapshot(){
  const api=repository();
  return api.snapshot([DOMAIN]);
 }

 root.HandymanV250LegacyMigration=Object.freeze({
  databaseName:"the_handyman_accountancy_v250_idb",
  domain:DOMAIN,format:FORMAT,inspect,stage,snapshot
 });
})(window);
