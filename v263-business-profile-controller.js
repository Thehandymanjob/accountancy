/* THA v263 Business Profile controller.
   One neutral business-identity source for document branding.
   It has no Projects or Accounting dependency and never reads LocalStorage.
*/
(function(root){
 "use strict";
 const adapter=()=>{const x=root.HandymanAppStorageV263;if(!x)throw new Error("v263 application storage is unavailable.");return x;};
 const engine=()=>{const x=root.HandymanStorageV263;if(!x)throw new Error("v263 IndexedDB engine is unavailable.");return x;};
 const fields=["businessName","ownerName","phone","email","address","logo","paymentDetails"];
 function normalize(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Business Profile must be an object.");
  const result={...value};
  for(const key of fields)if(result[key]===undefined||result[key]===null)result[key]="";
  for(const key of fields)if(typeof result[key]!=="string")throw new Error("Business Profile field must be text: "+key);
  return result;
 }
 async function initialize(){const r=await adapter().initialize();return {ok:true,database:r.database,domain:"business_profile",build:"THA-263-BUSINESS-PROFILE-1"};}
 async function load(){await initialize();return normalize(await adapter().read("businessProfile"));}
 async function save(value){const next=normalize(value);await initialize();const written=await adapter().write("businessProfile",next);if(!written||written.ok!==true)throw new Error("Business Profile save was not confirmed.");const check=normalize(await adapter().read("businessProfile"));if(!(await engine().valuesEqual(check,next)))throw new Error("Business Profile read-back verification failed.");return {ok:true,profile:check};}
 async function update(patch){if(!patch||typeof patch!=="object"||Array.isArray(patch))throw new Error("A profile patch object is required.");const current=await load();return save({...current,...patch});}
 async function importLegacyProfile(source){if(!source||typeof source!=="object"||Array.isArray(source))throw new Error("A legacy profile object must be supplied explicitly.");await initialize();const existing=await engine().get("business_profile","identity");if(existing!==null){const current=normalize(existing),incoming=normalize(source);if(await engine().valuesEqual(current,incoming))return {ok:true,imported:false,unchanged:true,profile:current};throw new Error("Business Profile conflict: an existing profile is present. Legacy import was blocked to prevent overwriting newer data.");}const result=await save(source);return {...result,imported:true};}
 async function inspectLegacyProjectsProfile(){
  await initialize();
  const projects=await adapter().read("projects");
  const legacy=projects&&projects.profile&&typeof projects.profile==="object"&&!Array.isArray(projects.profile)?projects.profile:{};
  const populated=Object.keys(legacy).some(key=>legacy[key]!==""&&legacy[key]!==null&&legacy[key]!==undefined);
  return {ok:true,found:populated,fieldNames:Object.keys(legacy),hasLogo:typeof legacy.logo==="string"&&legacy.logo.length>0,hasPaymentDetails:!!(legacy.paymentDetails||legacy.bankDetails||legacy.bankAccountDetails)};
 }
 async function migrateLegacyProjectsProfile(){
  await initialize();
  const projects=await adapter().read("projects");
  const legacy=projects&&projects.profile&&typeof projects.profile==="object"&&!Array.isArray(projects.profile)?projects.profile:{};
  const populated=Object.keys(legacy).some(key=>legacy[key]!==""&&legacy[key]!==null&&legacy[key]!==undefined);
  if(!populated)return {ok:true,migrated:false,reason:"no-legacy-profile"};
  const projectsBackup=await adapter().backup("projects");
  const profileBackup=await backup();
  const imported=await importLegacyProfile(legacy);
  const verifiedProfile=await load();
  if(!(await engine().valuesEqual(verifiedProfile,normalize(legacy))))throw new Error("Legacy Business Profile verification failed; Projects data was not changed.");
  const nextProjects={...projects,profile:{}};
  const written=await adapter().write("projects",nextProjects);
  if(!written||written.ok!==true)throw new Error("Business Profile was saved, but Projects profile cleanup was not confirmed. Original Projects data remains recoverable from the returned backup on retry.");
  const verifiedProjects=await adapter().read("projects");
  if(!(await engine().valuesEqual(verifiedProjects,nextProjects)))throw new Error("Projects profile cleanup verification failed. Backups were created before the change.");
  return {ok:true,migrated:true,imported:!!imported.imported,projectsBackup,profileBackup,profile:verifiedProfile};
 }
  async function backup(){await initialize();return engine().snapshot(["business_profile"]);}
 async function restore(pkg){if(!pkg||!Array.isArray(pkg.domains)||pkg.domains.length!==1||pkg.domains[0]!=="business_profile"||!Array.isArray(pkg.records)||pkg.records.some(x=>x.domain!=="business_profile"))throw new Error("Business Profile restore accepts only a Business Profile backup.");const result=await engine().restore(pkg);if(!result||result.ok!==true)throw new Error("Business Profile restore was not confirmed.");return result;}
 root.HandymanBusinessProfileV263=Object.freeze({fields,initialize,load,save,update,importLegacyProfile,inspectLegacyProjectsProfile,migrateLegacyProjectsProfile,backup,restore});
})(window);
