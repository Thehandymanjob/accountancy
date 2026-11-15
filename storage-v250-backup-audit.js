/* THA v250 — authoritative backup audit planner.
   Reads a user-selected complete-user-data JSON backup in memory only.
   It does not access IndexedDB, LocalStorage, or write application data.
*/
(function(root){
 "use strict";
 const EXPECTED_SHA256="07b6170db9169e3b59d0b4527b88e26d589bd18c178ec9a1b1975b55f403db90";
 const EXPECTED_EXPORT="2026-11-07T08:35:24.557Z";
 const EXPECTED_VERSION=6;
 const arr=v=>Array.isArray(v);
 const obj=v=>!!v&&typeof v==="object"&&!arr(v);
 const num=v=>typeof v==="number"&&Number.isFinite(v)?v:0;
 const canonical=value=>{
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  return JSON.stringify(value);
 };
 const sum=(items,field)=>items.reduce((t,x)=>t+num(x&&x[field]),0);
 const ids=list=>list.filter(obj).map(x=>x.id).filter(x=>typeof x==="string"&&x);
 const duplicateIds=list=>{const seen=new Set(),dupes=new Set();for(const id of ids(list)){if(seen.has(id))dupes.add(id);seen.add(id)}return [...dupes]};
 const count=list=>arr(list)?list.length:0;
 async function sha256(buffer){
  if(!root.crypto||!root.crypto.subtle)throw new Error("Web Crypto SHA-256 is unavailable in this browser.");
  const digest=await root.crypto.subtle.digest("SHA-256",buffer);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
 }
 function auditBackup(data,hash,bytes,fileName){
  const issues=[],warnings=[];
  if(!obj(data)||data.backupType!=="complete-user-data"||!obj(data.data)||!obj(data.projects)||!arr(data.contracts)){
   return {ok:false,validBackupShape:false,issues:[{code:"backup_shape",severity:"blocker",message:"Expected a complete-user-data backup with data, projects and contracts sections."}],writesPerformed:false,localStorageChanged:false,typedDomainsChanged:false,appCutover:false};
  }
  const a=data.data,p=data.projects,c=data.contracts;
  for(const [key,value] of [["entries",a.entries],["customers",a.customers],["invoices",a.invoices],["customExpenseCategories",a.customExpenseCategories],["projects",p.projects],["workers",p.workers],["partners",p.partners],["contractors",p.contractors],["companies",p.companies],["companyJobs",p.companyJobs],["contracts",c]]){
   if(!arr(value))issues.push({code:"section_not_array",severity:"blocker",section:key});
  }
  if(issues.length)return {ok:false,validBackupShape:false,issues,writesPerformed:false,localStorageChanged:false,typedDomainsChanged:false,appCutover:false};
  const lists=[
   ["accounting.entries",a.entries],["accounting.customers",a.customers],["accounting.invoices",a.invoices],
   ["projects.projects",p.projects],["projects.workers",p.workers],["projects.partners",p.partners],
   ["projects.contractors",p.contractors],["projects.companies",p.companies],["contracts",c]
  ];
  const idAudit=lists.map(([name,list])=>({name,count:list.length,missingIdCount:list.filter(x=>!obj(x)||typeof x.id!=="string"||!x.id.trim()).length,duplicateIds:duplicateIds(list)}));
  for(const item of idAudit){if(item.duplicateIds.length)warnings.push({code:"duplicate_ids_preserved",area:item.name,ids:item.duplicateIds});if(item.missingIdCount)warnings.push({code:"missing_ids",area:item.name,count:item.missingIdCount});}
  const projects=p.projects.map(project=>{
   const subs=arr(project.subprojects)?project.subprojects:[];
   const subAudit=subs.map(s=>({
    id:s.id||null,name:s.name||s.title||null,price:num(s.price),
    incomeCount:count(s.income),incomeTotal:sum(arr(s.income)?s.income:[],"amount"),
    expenseCount:count(s.expenses),expenseTotal:sum(arr(s.expenses)?s.expenses:[],"amount"),
    wagesCount:count(s.wages),wagesTotal:sum(arr(s.wages)?s.wages:[],"amount"),
    duplicateIncomeIds:duplicateIds(arr(s.income)?s.income:[]),
    duplicateExpenseIds:duplicateIds(arr(s.expenses)?s.expenses:[])
   }));
   const subPriceTotal=subAudit.reduce((t,s)=>t+s.price,0);
   const subIncomeTotal=subAudit.reduce((t,s)=>t+s.incomeTotal,0);
   const subExpenseTotal=subAudit.reduce((t,s)=>t+s.expenseTotal,0);
   const duplicateSubIds=duplicateIds(subs);
   if(duplicateSubIds.length)warnings.push({code:"duplicate_subproject_ids_preserved",projectId:project.id,ids:duplicateSubIds});
   return {id:project.id||null,name:project.name||null,projectPrice:num(project.price),status:project.status||null,subprojectCount:subs.length,subprojectPriceTotal:subPriceTotal,priceDifference:subPriceTotal-num(project.price),subprojectIncomeTotal:subIncomeTotal,subprojectExpenseTotal:subExpenseTotal,subprojects:subAudit};
  });
  const entryIncome=a.entries.filter(x=>x&&x.type==="income"),entryExpense=a.entries.filter(x=>x&&x.type==="expense");
  const invoiceNumbers=a.invoices.map(x=>Number(x&&x.number)).filter(Number.isFinite);
  const entryNumbers=a.entries.map(x=>Number(x&&x.number)).filter(Number.isFinite);
  const highestNumber=Math.max(0,...invoiceNumbers,...entryNumbers);
  const financialWarnings=projects.filter(x=>Math.abs(x.priceDifference)>0.005).map(x=>({code:"project_subproject_price_mismatch",projectId:x.id,projectPrice:x.projectPrice,subprojectPriceTotal:x.subprojectPriceTotal,difference:x.priceDifference}));
  warnings.push(...financialWarnings);
  const hashMatches=hash===EXPECTED_SHA256;
  if(!hashMatches)issues.push({code:"source_hash_mismatch",severity:"blocker",expected:EXPECTED_SHA256,actual:hash});
  if(data.exportedAt!==EXPECTED_EXPORT||data.version!==EXPECTED_VERSION)warnings.push({code:"backup_metadata_differs",expectedExportedAt:EXPECTED_EXPORT,actualExportedAt:data.exportedAt,expectedVersion:EXPECTED_VERSION,actualVersion:data.version});
  const sourceDomains=[
   {source:"data",target:{domain:"accounting",key:"main"},kind:"complete-accounting-object"},
   {source:"projects",target:{domain:"projects",key:"main"},kind:"complete-project-workspace"},
   {source:"contracts",target:{domain:"contracts",key:"main"},kind:"contract-array"}
  ];
  const summary={
   backupType:data.backupType,version:data.version,exportedAt:data.exportedAt,fileName:fileName||null,fileBytes:bytes,sha256:hash,expectedSha256:EXPECTED_SHA256,sourceHashMatches:hashMatches,
   accounting:{entries:a.entries.length,incomeEntries:entryIncome.length,incomeTotal:sum(entryIncome,"amount"),expenseEntries:entryExpense.length,expenseTotal:sum(entryExpense,"amount"),customers:a.customers.length,invoices:a.invoices.length,customExpenseCategories:a.customExpenseCategories.length,thirdPartyTransactions:count(a.thirdPartyTransactions),highestNumber},
   projectWorkspace:{projects:p.projects.length,workers:p.workers.length,partners:p.partners.length,contractors:p.contractors.length,companies:p.companies.length,companyJobs:p.companyJobs.length,projectsAudit:projects},
   contracts:{count:c.length},
   duplicateIdAudit:idAudit,
   proposedSourceDomains:sourceDomains,
   unmappedLegacyPolicy:"All LocalStorage keys not represented in this backup remain preserved in the existing v250 legacy domain; no key is deleted or overwritten."
  };
  return {ok:issues.length===0,mode:"backup-file-read-only-audit",validBackupShape:true,sourceAuthority:"New_new(1).json only",summary,issues,warnings,writesPerformed:false,localStorageChanged:false,typedDomainsChanged:false,appCutover:false,nextGate:"Review this report, then separately implement and test an atomic typed-domain import with snapshot rollback."};
 }
 async function inspectFile(file){
  if(!file)throw new Error("Select the designated New_new(1).json file first.");
  const buffer=await file.arrayBuffer();
  const hash=await sha256(buffer);
  let parsed;
  try{parsed=JSON.parse(new TextDecoder().decode(buffer))}catch(_){throw new Error("The selected file is not valid JSON.");}
  const result=auditBackup(parsed,hash,buffer.byteLength,file.name);
  if(result.validBackupShape){
   const sources=[
    {source:"data",domain:"accounting",key:"main",value:parsed.data,recordCount:1,nestedCounts:{entries:count(parsed.data.entries),customers:count(parsed.data.customers),invoices:count(parsed.data.invoices),customExpenseCategories:count(parsed.data.customExpenseCategories),thirdPartyTransactions:count(parsed.data.thirdPartyTransactions)}},
    {source:"projects",domain:"projects",key:"main",value:parsed.projects,recordCount:1,nestedCounts:{projects:count(parsed.projects.projects),workers:count(parsed.projects.workers),partners:count(parsed.projects.partners),contractors:count(parsed.projects.contractors),companies:count(parsed.projects.companies),companyJobs:count(parsed.projects.companyJobs)}},
    {source:"contracts",domain:"contracts",key:"main",value:parsed.contracts,recordCount:1,nestedCounts:{contracts:count(parsed.contracts)}}
   ];
   result.summary.payloadManifest=await Promise.all(sources.map(async item=>{
    const bytes=new TextEncoder().encode(canonical(item.value));
    return {source:item.source,destination:{domain:item.domain,key:item.key},recordCount:item.recordCount,nestedCounts:item.nestedCounts,canonicalBytes:bytes.byteLength,canonicalSha256:await sha256(bytes.buffer),sourceValuePreserved:true};
   }));
   result.summary.migrationMode="dry-run-only";
   result.summary.typedWritePrepared=false;
  }
  return result;
 }
 function selfTest(){
  const fixture={backupType:"complete-user-data",version:6,exportedAt:EXPECTED_EXPORT,data:{entries:[],customers:[],invoices:[],customExpenseCategories:[],thirdPartyTransactions:[]},projects:{projects:[],workers:[],partners:[],contractors:[],companies:[],companyJobs:[]},contracts:[]};
  const result=auditBackup(fixture,EXPECTED_SHA256,1,"fixture.json");
  const pass=result.validBackupShape&&result.writesPerformed===false&&result.appCutover===false&&result.summary.accounting.entries===0;
  return {ok:pass,checks:{backupShape:result.validBackupShape,readOnly:result.writesPerformed===false,noCutover:result.appCutover===false,emptyAccounting:result.summary.accounting.entries===0},expectedShaFixtureOnly:true};
 }
 root.HandymanV250BackupAudit={inspectFile,selfTest,expectedSha256:EXPECTED_SHA256};
})(typeof window!=="undefined"?window:this);
