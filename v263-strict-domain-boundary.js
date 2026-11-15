/* THA v263 strict domain boundary.
   Application-facing facade: every write, mutation, backup and restore is restricted
   to exactly one logical domain. Projects and Accounting cannot be mixed in a call.
   The underlying engine remains a low-level internal dependency; UI code must use
   this facade rather than HandymanStorageV263 directly.
*/
(function(root){
 "use strict";
 const ENGINE=()=>{const e=root.HandymanStorageV263;if(!e)throw new Error("v263 IndexedDB engine is unavailable.");return e;};
 const DOMAINS=Object.freeze({
  accounting:Object.freeze(["accounting","sequences"]),
  accountingState:Object.freeze(["accounting"]),
  invoiceSequence:Object.freeze(["sequences"]),
  projects:Object.freeze(["projects"]),
  contracts:Object.freeze(["contracts"]),
  businessProfile:Object.freeze(["business_profile"]),
  support:Object.freeze(["preferences","preference_meta","diagnostics","reports","report_notifications","report_settings","report_workflow","notifications","recovery","factory_reset_recovery"])
 });
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function scope(name){if(!own(DOMAINS,name))throw new Error("Unknown v263 domain scope: "+name);return DOMAINS[name];}
 function assertOneScope(name,domain){if(!scope(name).includes(domain))throw new Error("Domain "+domain+" is outside "+name+" scope.");}
 function assertSnapshot(name,pkg){
  const allowed=scope(name);
  if(!pkg||pkg.format!=="tha-v263-indexeddb-snapshot-v1"||!Array.isArray(pkg.domains)||!Array.isArray(pkg.records))throw new Error("Invalid v263 scoped backup.");
  if(pkg.domains.length!==1||pkg.domains[0]!==allowed[0])throw new Error("Backup must contain exactly one domain: "+allowed[0]+".");
  for(const row of pkg.records){if(!row||row.domain!==allowed[0])throw new Error("Mixed-domain backup rejected.");}
  return pkg;
 }
 function createScope(name){
  const allowed=scope(name),only=allowed.length===1?allowed[0]:null;
  function check(domain){if(!allowed.includes(domain))throw new Error("Cross-domain access rejected for "+name+": "+domain);}
  async function snapshot(){
   if(!only)throw new Error("This scope contains multiple independent domains. Create a backup for one domain at a time.");
   const pkg=await ENGINE().snapshot([only]);assertSnapshot(name,pkg);return pkg;
  }
  async function restore(pkg){
   if(!only)throw new Error("Restore must target exactly one domain. Use the accounting or projects scope separately.");
   assertSnapshot(name,pkg);const result=await ENGINE().restore(pkg);
   const verified=await ENGINE().snapshot([only]);
   if(verified.records.length!==pkg.records.length)throw new Error("Scoped restore record-count verification failed.");
   for(let i=0;i<pkg.records.length;i++){
    const a=verified.records[i],b=pkg.records.slice().sort((x,y)=>x.id.localeCompare(y.id))[i];
    if(!a||!b||a.id!==b.id||!(await ENGINE().valuesEqual(a.value,b.value)))throw new Error("Scoped restore verification failed.");
   }
   return {...result,verified:true,scope:name};
  }
  return Object.freeze({
   name,domains:allowed.slice(),
   get:async(domain,key)=>{check(domain);return ENGINE().get(domain,key);},
   put:async(domain,key,value)=>{check(domain);return ENGINE().put(domain,key,value);},
   mutate:async(domain,key,initialValue,updater)=>{check(domain);return ENGINE().mutateMany([{domain,key,initialValue}],rows=>{const next=updater(rows[0].value);if(next&&typeof next.then==="function")throw new Error("Updater must be synchronous.");return [next];});},
   reserveCounter:async(domain,key,minimum)=>{check(domain);return ENGINE().reserveCounter(domain,key,minimum);},
   snapshot,restore
  });
 }
 root.HandymanV263DomainBoundary=Object.freeze({
  build:"THA-263-STRICT-DOMAIN-BOUNDARY-1",
  createScope,
  scopes:Object.keys(DOMAINS)
 });
})(window);
