/* THA v263 domain-only backup and restore. No whole-database restore/reset. */
(function(root){
"use strict";
const FORMAT="tha-v263-domain-backup-v1",SNAP="tha-v263-indexeddb-snapshot-v1";
const MAP={accounting:["accountingState","accounting"],projects:["projects","projects"],contracts:["contracts","contracts"],invoiceSequence:["invoiceSequence","sequences"]};
const boundary=()=>root.HandymanV263DomainBoundary,engine=()=>root.HandymanStorageV263;
function cfg(n){if(!MAP[n])throw Error("Unsupported domain backup: "+n);if(!boundary()||!engine())throw Error("v263 storage modules are not loaded.");return MAP[n];}
function b64(bytes){let s="";for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,Math.min(i+32768,bytes.length)));return btoa(s);}
function un64(s){if(typeof s!=="string"||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error("Invalid binary backup data.");const x=atob(s),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a;}
async function enc(v,seen){
 if(v===null||["string","boolean","number"].includes(typeof v))return v;
 if(typeof v==="undefined")return {$tha:"Undefined"};if(typeof v==="bigint")return {$tha:"BigInt",value:String(v)};
 if(typeof v==="function"||typeof v==="symbol")throw Error("Unsupported value in backup.");
 if(seen.has(v))throw Error("Circular value found; backup stopped.");seen.add(v);
 try{
  if(v instanceof Date)return {$tha:"Date",value:v.toISOString()};
  if(typeof root.File==="function"&&v instanceof root.File)return {$tha:"File",name:v.name,type:v.type,lastModified:v.lastModified,data:b64(new Uint8Array(await v.arrayBuffer()))};
  if(v instanceof Blob)return {$tha:"Blob",type:v.type,data:b64(new Uint8Array(await v.arrayBuffer()))};
  if(v instanceof ArrayBuffer)return {$tha:"ArrayBuffer",data:b64(new Uint8Array(v))};
  if(ArrayBuffer.isView(v))return {$tha:"TypedArray",type:v.constructor.name,data:b64(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))};
  if(Array.isArray(v))return await Promise.all(v.map(x=>enc(x,seen)));
  const p=Object.getPrototypeOf(v);if(p!==Object.prototype&&p!==null)throw Error("Unsupported object type in backup.");
  const o={};for(const k of Object.keys(v))o[k]=await enc(v[k],seen);return o;
 }finally{seen.delete(v);}
}
async function dec(v){
 if(v===null||typeof v!=="object")return v;if(Array.isArray(v))return Promise.all(v.map(dec));
 if(v.$tha){switch(v.$tha){
 case "Undefined":return undefined;case "BigInt":return BigInt(v.value);
 case "Date":{const d=new Date(v.value);if(!Number.isFinite(d.getTime()))throw Error("Invalid Date.");return d;}
 case "Blob":return new Blob([un64(v.data)],{type:v.type||""});
 case "File":if(typeof root.File!=="function")throw Error("File restore is unsupported in this browser.");return new File([un64(v.data)],String(v.name||"file"),{type:v.type||"",lastModified:Number(v.lastModified)||0});
 case "ArrayBuffer":return un64(v.data).buffer;
 case "TypedArray":{const b=un64(v.data),buf=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),C={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,DataView};if(typeof BigInt64Array!=="undefined")C.BigInt64Array=BigInt64Array;if(typeof BigUint64Array!=="undefined")C.BigUint64Array=BigUint64Array;const T=C[v.type];if(!T||(v.type!=="DataView"&&buf.byteLength%T.BYTES_PER_ELEMENT))throw Error("Invalid typed array.");return new T(buf);}
 default:throw Error("Unknown backup value type.");
 }}
 const o={};for(const k of Object.keys(v))o[k]=await dec(v[k]);return o;
}
async function hash(v){if(!root.crypto||!root.crypto.subtle)throw Error("SHA-256 unavailable; operation blocked.");const h=await root.crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,"0")).join("");}
async function createBackup(name){
 const [scope,domain]=cfg(name);await engine().ready();const snap=await boundary().createScope(scope).snapshot();
 if(snap.domains.length!==1||snap.domains[0]!==domain||snap.records.some(r=>r.domain!==domain))throw Error("Mixed-domain snapshot rejected.");
 const payload={format:SNAP,database:engine().databaseName,domainName:name,createdAt:snap.createdAt,domains:[domain],records:[]};
 for(const r of snap.records)payload.records.push({id:r.id,domain:r.domain,key:r.key,value:await enc(r.value,new WeakSet())});
 const digest=await hash(payload),pkg={format:FORMAT,algorithm:"SHA-256",digest,payload},blob=new Blob([JSON.stringify(pkg)],{type:"application/vnd.thehandyman.v263-domain-backup+json"});
 return {ok:true,blob,filename:"THA-v263-"+name+"-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",verification:{ok:true,domain:name,records:payload.records.length,digest}};
}
async function parse(name,file){
 const [scope,domain]=cfg(name);if(!file||typeof file.text!=="function")throw Error("Select a backup file.");
 let pkg;try{pkg=JSON.parse(await file.text());}catch(_){throw Error("Invalid backup JSON.");}
 if(!pkg||pkg.format!==FORMAT||pkg.algorithm!=="SHA-256"||!pkg.payload)throw Error("Not a v263 domain backup.");
 const p=pkg.payload;if(p.format!==SNAP||p.database!==engine().databaseName||p.domainName!==name||!Array.isArray(p.domains)||p.domains.length!==1||p.domains[0]!==domain||!Array.isArray(p.records))throw Error("Backup is for another domain or database.");
 if(await hash(p)!==pkg.digest)throw Error("Backup SHA-256 verification failed.");
 const ids=new Set(),records=[];
 for(const r of p.records){if(!r||r.domain!==domain||typeof r.key!=="string"||r.id!==domain+":"+encodeURIComponent(r.key)||ids.has(r.id))throw Error("Invalid or mixed-domain record.");ids.add(r.id);records.push({id:r.id,domain,key:r.key,value:await dec(r.value)});}
 return {scope,pkg,snapshot:{format:SNAP,database:p.database,createdAt:p.createdAt,domains:p.domains,records}};
}
async function inspectFile(name,file){const x=await parse(name,file);return {ok:true,domain:name,records:x.snapshot.records.length,digest:x.pkg.digest};}
async function restoreFromFile(name,file){
 const x=await parse(name,file),api=boundary().createScope(x.scope),result=await api.restore(x.snapshot),after=await api.snapshot(),want=x.snapshot.records.slice().sort((a,b)=>a.id.localeCompare(b.id));
 if(after.records.length!==want.length)throw Error("Restore verification failed: record count mismatch.");
 for(let i=0;i<want.length;i++)if(after.records[i].id!==want[i].id||!(await engine().valuesEqual(after.records[i].value,want[i].value)))throw Error("Restore verification failed for "+want[i].domain+"/"+want[i].key);
 return {ok:true,domain:name,restored:result.restored,verified:true};
}
async function downloadBackup(name){const x=await createBackup(name),url=URL.createObjectURL(x.blob),a=root.document.createElement("a");a.href=url;a.download=x.filename;a.style.display="none";root.document.body.appendChild(a);a.click();a.remove();root.setTimeout(()=>URL.revokeObjectURL(url),60000);return {ok:true,filename:x.filename,verification:x.verification};}
root.HandymanDomainRecoveryV263=Object.freeze({build:"THA-263-DOMAIN-RECOVERY-1",domains:Object.keys(MAP),createBackup,downloadBackup,inspectFile,restoreFromFile});
})(window);
