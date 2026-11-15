/* THA complete-data coverage audit — read-only, v250 migration lab.
   Inspects same-origin LocalStorage keys and IndexedDB stores without writing either source. */
(function(root){
 "use strict";
 const domains=[
  ["accounting",/accounting|invoice_sequence|sequence_cleanup|empty_invoice/i],
  ["projects",/projects|project_workspace|workspace/i],
  ["contracts",/contracts/i],
  ["reports",/report/i],
  ["language",/language/i],
  ["monitor_diagnostics",/monitor|diagnostic|audit/i],
  ["support",/help_contact|support/i],
  ["recovery_restore",/recovery|restore|factory_reset|baseline/i],
  ["other_app_data",/.*/]
 ];
 const known=[
  "tha_test226_accounting_v1","tha_test226_projects_v1","tha_test226_contracts_v1",
  "tha_test226_monitor_log_v1","tha_test226_invoice_sequence_v1",
  "tha_test226_invoice_sequence_cleanup_v1","tha_test226_empty_invoice_sequence_reset_v229",
  "tha_test226_app_language_v1","tha_test226_app_language_pref_version_v1",
  "tha_test226_report_archive_v1","tha_test226_report_notifications_v1",
  "tha_test226_report_settings_v1","tha_test226_report_workflow_v1",
  "tha_test226_report_email_settings_v1","tha_test226_help_contact_drafts_v1",
  "tha_test226_factory_reset_recovery_v1","tha_test226_isolation_test_record_cleanup_v1"
 ];
 const bytes=s=>new Blob([String(s)]).size;
 const digest=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return("00000000"+(h>>>0).toString(16)).slice(-8)};
 const shape=v=>{
  if(Array.isArray(v))return {type:"array",count:v.length};
  if(v&&typeof v==="object")return {type:"object",keys:Object.keys(v).sort().slice(0,60)};
  return {type:v===null?"null":typeof v};
 };
 const classify=k=>{
  if(known.includes(k)){const match=domains.find(x=>x[0]!=="other_app_data"&&x[1].test(k));return {domain:match?match[0]:"other_app_data",classification:"known-active-key"};}
  if(/^tha_restore_test_v1_/.test(k)||/^tha_v\d+_/.test(k)||/^handyman_/.test(k))return {domain:"legacy_or_recovery_namespace",classification:"requires-provenance-review"};
  for(const [domain,re] of domains)if(domain!=="other_app_data"&&re.test(k))return {domain,classification:"unlisted-key-review"};
  return {domain:"unclassified",classification:"manual-review"};
 };
 async function inspect(){
  const a=root.HandymanStorageFoundation;
  if(!a||typeof a.openDatabase!=="function")throw Error("Storage foundation unavailable");
  const localKeys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k)localKeys.push(k)}
  localKeys.sort();
  const localRows=localKeys.map(key=>{
   const raw=localStorage.getItem(key);let parsed=null,validJson=null;
   if(raw!==null){try{parsed=JSON.parse(raw);validJson=true}catch(_){validJson=false}}
   return {key,...classify(key),present:raw!==null,bytes:bytes(raw||""),digest:raw===null?null:digest(raw),
    validJson,shape:validJson?shape(parsed):{type:raw===null?"missing":"plain-string"}};
  });
  const db=await a.openDatabase();
  try{
   const stores=[...a.stores],idb={};
   for(const name of stores){
    const tx=db.transaction([name],"readonly"),req=tx.objectStore(name).getAll();
    const rows=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error||Error("Read failed: "+name))});
    idb[name]={count:rows.length,approxBytes:bytes(JSON.stringify(rows)),ids:rows.slice(0,100).map(x=>String(x.id??x.key??"")).filter(Boolean)};
   }
   const byDomain={};for(const row of localRows)(byDomain[row.domain]??=[]).push(row.key);
   const digestGroups={};for(const row of localRows)if(row.present){(digestGroups[row.digest]??=[]).push({key:row.key,bytes:row.bytes,domain:row.domain});}
   const identicalLocalStorageValueGroups=Object.entries(digestGroups).filter(([,rows])=>rows.length>1).map(([valueDigest,rows])=>({valueDigest,rows}));
   const missingKnownKeys=known.filter(key=>!localKeys.includes(key));

   const unknown=localRows.filter(x=>x.classification!=="known-active-key");
   const invalid=localRows.filter(x=>x.present&&x.validJson===false);
   const totals={localStorageKeys:localRows.length,localStorageBytes:localRows.reduce((n,x)=>n+x.bytes,0),
    indexedDBRecords:Object.values(idb).reduce((n,x)=>n+x.count,0),indexedDBStores:Object.keys(idb).length};
   return {ok:true,diagnostic:"complete-data-coverage-audit-v2",readOnly:true,willWrite:false,
    localStorageChanged:false,indexedDBChanged:false,appCutover:false,database:a.databaseName,schemaVersion:a.schemaVersion,
    totals,knownKeys:known.map(key=>({key,present:localKeys.includes(key)})),missingKnownKeys,identicalLocalStorageValueGroups,localStorage:localRows,
    localStorageByDomain:byDomain,unknownOrLegacyKeys:unknown,invalidJsonKeys:invalid,indexedDB:idb,
    backupCoverage:{knownLocalStorageKeys:known.length,presentKnownKeys:known.filter(k=>localKeys.includes(k)).length,
     unclassifiedOrLegacyCount:unknown.length,invalidJsonCount:invalid.length,
     status:"inventory-only; no backup was generated; unknown and legacy keys require provenance review"},
    safety:"No raw stored values are returned. No LocalStorage or IndexedDB writes, deletes, imports or exports are performed."};
  }finally{db.close()}
 }
 root.HandymanCompleteDataAudit=Object.freeze({inspect});
})(window);
