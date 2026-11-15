/* THA v264 media repository — IndexedDB-only, one record per binary asset.
   Each Blob/File is stored under its stable asset ID in the isolated media domain.
   This avoids rewriting every image when one receipt or project photo changes.
*/
(function(root){
 "use strict";
 const scope=()=>{const b=root.HandymanV264DomainBoundary;if(!b)throw new Error("v264 strict domain boundary is unavailable.");return b.createScope("media");};
 const engine=()=>{const e=root.HandymanStorageV264;if(!e)throw new Error("v264 IndexedDB engine is unavailable.");return e;};
 const clone=v=>root.structuredClone(v);
 const validId=id=>typeof id==="string"&&id.trim().length>0&&id.length<=256;
 const validBlob=value=>typeof Blob!=="undefined"&&value instanceof Blob;
 async function initialize(){const a=root.HandymanAppStorageV264;if(!a)throw new Error("v264 application storage adapter is unavailable.");await a.initialize();return {ok:true,mode:"indexeddb-only",domain:"media",recordModel:"one-asset-per-record"};}
 async function saveAsset(input){
  if(!input||typeof input!=="object"||!validId(input.id)||!validBlob(input.blob))throw new Error("Media asset requires a stable ID and Blob/File data.");
  await initialize();
  const api=scope(),prior=await api.get("media",input.id),now=new Date().toISOString();
  const asset={id:input.id,name:String(input.name||input.fileName||"asset").slice(0,255),type:String(input.type||input.blob.type||"application/octet-stream"),size:input.blob.size,createdAt:prior?.createdAt||input.createdAt||now,updatedAt:now,ownerType:String(input.ownerType||"general"),ownerId:String(input.ownerId||""),role:String(input.role||"attachment"),blob:input.blob};
  const result=await api.put("media",asset.id,asset);
  if(!result||result.ok!==true)throw new Error("Media asset save was not confirmed.");
  const saved=await api.get("media",asset.id);
  if(!saved||!(await engine().valuesEqual(saved,asset)))throw new Error("Media asset full-content verification failed.");
  return {ok:true,asset:clone(saved)};
 }
 async function getAsset(id){if(!validId(id))throw new Error("A media asset ID is required.");await initialize();const asset=await scope().get("media",id);return asset===null?null:clone(asset);}
 async function deleteAsset(id){if(!validId(id))throw new Error("A media asset ID is required.");await initialize();const api=scope(),prior=await api.get("media",id);if(prior===null)return {ok:true,removed:false};const result=await engine().remove("media",id);if(!result||result.ok!==true||await api.get("media",id)!==null)throw new Error("Media deletion verification failed.");return {ok:true,removed:true};}
 async function list(filter){
  await initialize();
  const snapshot=await engine().snapshot(["media"]);
  const items=snapshot.records.map(row=>row.value).filter(x=>x&&typeof x==="object"&&validId(x.id)&&(!filter||(!filter.ownerType||x.ownerType===filter.ownerType)&&(!filter.ownerId||x.ownerId===filter.ownerId)&&(!filter.role||x.role===filter.role)));
  return items.map(({blob,...meta})=>clone(meta));
 }
 root.HandymanMediaV264=Object.freeze({initialize,load:list,saveAsset,getAsset,deleteAsset,list});
})(window);
