/* THA source-to-IndexedDB reconciliation — read-only diagnostic.
   Compares active LocalStorage payloads with normalized typed IndexedDB records.
   Never writes, imports, deletes, snapshots, or changes app storage. */
(function(root){
 "use strict";
 const LS={
  accounting:"tha_test226_accounting_v1",projects:"tha_test226_projects_v1",
  contracts:"tha_test226_contracts_v1",sequence:"tha_test226_invoice_sequence_v1",
  monitor:"tha_test226_monitor_log_v1",notifications:"tha_test226_report_notifications_v1",
  language:"tha_test226_app_language_v1",languageVersion:"tha_test226_app_language_pref_version_v1"
 };
 const canonical=v=>{
  if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
  if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
  return JSON.stringify(v);
 };
 const parse=(key)=>{const raw=root.localStorage.getItem(key);if(raw===null)return {present:false,raw:null,value:null};try{return {present:true,raw,value:JSON.parse(raw)}}catch(_){return {present:true,raw,value:raw,plainString:true}}};
 const idOf=(v,i,prefix)=>String(v&&v.id!==undefined&&v.id!==null&&String(v.id).trim()!==""?v.id:"legacy-"+prefix+"-"+String(i+1).padStart(6,"0"));
 const compactIds=xs=>xs.slice(0,30);
 async function inspect(){
  const api=root.HandymanStorageFoundation;if(!api||!api.openDatabase)throw Error("IndexedDB foundation unavailable");
  const db=await api.openDatabase();
  try{
   const report={ok:true,diagnostic:"source-idb-reconciliation-v1",readOnly:true,willWrite:false,
    localStorageChanged:false,indexedDBChanged:false,appCutover:false,database:api.databaseName,schemaVersion:api.schemaVersion,
    domains:{},unmappedSources:[],notes:[]};
   const readStore=async name=>{const tx=db.transaction([name],"readonly"),req=tx.objectStore(name).getAll();return await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error||Error("Read failed: "+name));});};
   const compare=(label,store,sourceRows,opts={})=>{
    const existing=opts.existing||[];const keyFn=opts.keyFn||((x)=>String(x.id));
    const srcMap=new Map(),duplicates=[];
    sourceRows.forEach((x,i)=>{const k=keyFn(x,i);if(srcMap.has(k))duplicates.push(k);else srcMap.set(k,x);});
    const dbMap=new Map(existing.map((x)=>[String(x.id),x]));
    const missing=[],identical=[],conflicts=[];
    for(const [id,row] of srcMap){const prior=dbMap.get(id);if(!prior)missing.push(id);else if(canonical(prior)===canonical(row))identical.push(id);else conflicts.push(id);}
    const extra=[...dbMap.keys()].filter(id=>!srcMap.has(id));
    report.domains[label]={targetStore:store,sourceCount:sourceRows.length,targetCount:existing.length,
     exactMatches:identical.length,missingFromIndexedDB:missing.length,conflictingSameId:conflicts.length,
     extraInIndexedDB:extra.length,duplicateSourceIds:duplicates.length,
     missingIds:compactIds(missing),conflictingIds:compactIds(conflicts),extraIds:compactIds(extra),
     duplicateIds:compactIds(duplicates),comparison:"canonical full-record equality"};
   };
   const a=parse(LS.accounting),p=parse(LS.projects),c=parse(LS.contracts);
   const projectRaw=root.localStorage.getItem(LS.projects);
   let projectProbe={expectedKey:LS.projects,present:projectRaw!==null,bytes:projectRaw===null?0:new Blob([projectRaw]).size,
    validJson:null,parsedType:null,rootKeys:[],arrayFields:[],parseError:null,candidateKeys:[]};
   if(projectRaw!==null){try{const parsed=JSON.parse(projectRaw);projectProbe.validJson=true;projectProbe.parsedType=parsed===null?"null":Array.isArray(parsed)?"array":typeof parsed;
    if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)){projectProbe.rootKeys=Object.keys(parsed).sort();projectProbe.arrayFields=Object.keys(parsed).filter(k=>Array.isArray(parsed[k])).sort();}
    else if(Array.isArray(parsed))projectProbe.arrayFields=["<root-array>"];
   }catch(e){projectProbe.validJson=false;projectProbe.parsedType="string";projectProbe.parseError=String(e&&e.message||e).slice(0,180);}}
   for(let i=0;i<root.localStorage.length;i++){const key=root.localStorage.key(i);if(key&&/project|workspace/i.test(key))projectProbe.candidateKeys.push(key);}
   projectProbe.candidateKeys.sort();
   report.domains.projectsSourceProbe=projectProbe;
   if(a.present&&!a.plainString&&a.value&&typeof a.value==="object"){
    const d=a.value;
    for(const [field,store] of [["entries","accountingEntries"],["customers","customers"],["invoices","invoices"]]){
     const rows=Array.isArray(d[field])?d[field]:[];
     const normalized=rows.map((x,i)=>({...x,id:idOf(x,i,field.slice(0,-1))}));
     compare("accounting."+field,store,normalized,{existing:await readStore(store)});
    }
    const categories=Array.isArray(d.customExpenseCategories)?d.customExpenseCategories:[];
    const categoryRows=categories.map((name,i)=>({id:"legacy-category-"+String(i+1).padStart(6,"0"),name:String(name),position:i}));
    compare("accounting.customExpenseCategories","customExpenseCategories",categoryRows,{existing:await readStore("customExpenseCategories")});
    report.domains["accounting.settings"]={targetStore:"accountingSettings",sourceCount:d.settings?1:0,targetCount:(await readStore("accountingSettings")).length,
     status:"not compared; prior settings differences were explicitly accepted by user"};
   }else report.notes.push("Active Accounting LocalStorage payload missing or invalid; no content comparison performed.");
   if(p.present&&!p.plainString&&p.value&&typeof p.value==="object"){
    const d=p.value;
    for(const store of ["projects","workers","partners","contractors","companies","companyJobs"]){
     const rows=Array.isArray(d[store])?d[store]:[];
     compare("projects."+store,store,rows,{existing:await readStore(store)});
    }
    const profile=await readStore("projectMetadata"),profileRow=profile.find(x=>x.id==="__tha_projects_profile_v1__");
    const stateRow=profile.find(x=>x.id==="__tha_projects_workspace_state_v1__");
    const state={};for(const [k,v] of Object.entries(d))if(!["projects","workers","partners","contractors","companies","companyJobs","profile"].includes(k))state[k]=v;
    report.domains["projects.profile"]={targetStore:"projectMetadata",sourceCount:d.profile===undefined?0:1,targetPresent:!!profileRow,
     exactMatch:!!profileRow&&canonical(profileRow.value)===canonical(d.profile),status:"normalized profile metadata"};
    report.domains["projects.workspaceState"]={targetStore:"projectMetadata",sourceCount:1,targetPresent:!!stateRow,
     exactMatch:!!stateRow&&canonical(stateRow.value)===canonical(state),sourceFields:Object.keys(state).sort(),
     targetFields:stateRow&&stateRow.value&&typeof stateRow.value==="object"?Object.keys(stateRow.value).sort():[],status:"normalized workspace state"};
    const projectRows=Array.isArray(d.projects)?d.projects:[];
    report.domains["projects.subprojects"]={sourceCount:projectRows.reduce((n,x)=>n+(Array.isArray(x.subprojects)?x.subprojects.length:0),0),
     targetCount:(await readStore("projects")).reduce((n,x)=>n+(Array.isArray(x.subprojects)?x.subprojects.length:0),0),
     sourceIncomeCount:projectRows.reduce((n,x)=>n+(Array.isArray(x.subprojects)?x.subprojects.reduce((m,s)=>m+(Array.isArray(s.income)?s.income.length:0),0):0),0),
     targetIncomeCount:(await readStore("projects")).reduce((n,x)=>n+(Array.isArray(x.subprojects)?x.subprojects.reduce((m,s)=>m+(Array.isArray(s.income)?s.income.length:0),0):0),0),
     status:"counts only; project records above are compared in full including nested data and photos"};
   }else report.notes.push("Active Projects LocalStorage payload missing or invalid; no content comparison performed.");
   const contracts=await readStore("contracts");
   report.domains.contracts={activeLocalStoragePresent:c.present,activeSourceCount:c.present&&Array.isArray(c.value)?c.value.length:null,
    indexedDBCount:contracts.length,status:c.present?"requires record-level comparison":"active LocalStorage key absent; IndexedDB records may be older/imported; provenance unresolved"};
   const monitor=parse(LS.monitor),notifications=parse(LS.notifications);
   const audit=await readStore("auditLog");
   report.domains.monitorDiagnostics={localStoragePresent:monitor.present,localStorageCount:Array.isArray(monitor.value)?monitor.value.length:null,
    indexedDBAuditLogCount:audit.length,status:"not yet mapped; auditLog is not assumed to be equivalent to monitor log"};
   report.domains.reportNotifications={localStoragePresent:notifications.present,localStorageCount:Array.isArray(notifications.value)?notifications.value.length:null,
    status:"no dedicated typed store mapping yet"};
   const seq=parse(LS.sequence),order=await readStore("recordOrder"),seqRow=order.find(x=>x.id==="invoice-sequence");
   report.domains.invoiceSequence={localStoragePresent:seq.present,localStorageValue:seq.value,
    indexedDBPresent:!!seqRow,indexedDBValue:seqRow?seqRow.value:null,exactMatch:!!seqRow&&canonical(seqRow.value)===canonical(seq.value)};
   const lang=parse(LS.language),langV=parse(LS.languageVersion),kv=await readStore("kv");
   report.domains.language={localStoragePresent:lang.present,localStorageValue:lang.value,localStoragePrefVersion:langV.value,
    indexedDBKvCount:kv.length,status:"no approved typed mapping yet"};
   // Read-only financial ledger mapping audit. It inspects nested project and company-job records
   // against typed IDB stores without attempting to infer or create links.
   if(p.present&&!p.plainString&&p.value&&Array.isArray(p.value.projects)){
    const projects=p.value.projects,ledgers=[];
    for(const project of projects){ledgers.push({project,ledger:project,subprojectId:"",subprojectName:"Main project"});for(const sub of (Array.isArray(project.subprojects)?project.subprojects:[]))ledgers.push({project,ledger:sub,subprojectId:String(sub.id||""),subprojectName:String(sub.name||"Sub-project")});}
    const categories=["income","expenses","wages","tools","food","contractors","materials"];
    const byCategory={};for(const category of categories){const rows=[];for(const item of ledgers){for(const row of (Array.isArray(item.ledger[category])?item.ledger[category]:[])){rows.push({id:String(row&&row.id!==undefined?row.id:""),projectId:String(item.project.id||""),subprojectId:item.subprojectId,amount:Number(row&&row.amount)||0,date:String(row&&row.date||""),paidBy:String(row&&row.paidBy||""),settled:String(row&&row.settled||"")});}}const ids=rows.map(x=>x.id).filter(Boolean);byCategory[category]={count:rows.length,withId:ids.length,missingId:rows.length-ids.length,duplicateIds:ids.length-new Set(ids).size,amount:Math.round(rows.reduce((n,x)=>n+x.amount,0)*100)/100,dated:rows.filter(x=>x.date).length};}
    const [receiptStore,expenseStore,thirdStore]=await Promise.all([readStore("projectReceipts"),readStore("projectExpenses"),readStore("thirdPartyTransactions")]);
    const syncedThird=thirdStore.filter(x=>x&&x.projectSync===true);
    const jobs=Array.isArray(p.value.companyJobs)?p.value.companyJobs:[];
    const jobAudit=jobs.map(job=>{const packages=Array.isArray(job.packages)?job.packages:[],payments=Array.isArray(job.payments)?job.payments:[],costs=packages.flatMap(pkg=>(Array.isArray(pkg.expenses)?pkg.expenses:[]).map(e=>({amount:Number(e&&e.amount)||0,id:String(e&&e.id||"")})));return {jobId:String(job.id||""),packageCount:packages.length,paymentCount:payments.length,packageExpenseCount:costs.length,packageExpenseAmount:Math.round(costs.reduce((n,x)=>n+x.amount,0)*100)/100,paymentsGross:Math.round(payments.reduce((n,x)=>n+(Number(x.gross)||0),0)*100)/100,paymentsDeduction:Math.round(payments.reduce((n,x)=>n+(Number(x.deduction)||0),0)*100)/100,paymentsNet:Math.round(payments.reduce((n,x)=>n+(Number(x.net)||0),0)*100)/100,linkedAccountingPayments:payments.filter(x=>!!x.accountingEntryId).length,attachments:packages.filter(x=>!!x.file).length+payments.filter(x=>!!x.file).length};});
    report.domains.projectFinancialMapping={sourceProjects:projects.length,sourceLedgers:ledgers.length,sourceRecordsByCategory:byCategory,
     indexedDB:{projectReceipts:receiptStore.length,projectExpenses:expenseStore.length,thirdPartyTransactions:thirdStore.length,projectSyncedThirdPartyTransactions:syncedThird.length},
     sourceProjectIds:projects.map(x=>String(x.id||"")),typedReceiptIds:receiptStore.map(x=>String(x.id||"")).slice(0,30),typedExpenseIds:expenseStore.map(x=>String(x.id||"")).slice(0,30),
     status:"counts and IDs only; no source-to-target equivalence inferred"};
    const typedProjects=await readStore("projects");
    const safeLedgerRows=(owner,ownerType)=>{const out=[];for(const category of ["income","expenses","wages","tools","food","contractors","materials","receipts"]){for(const row of (Array.isArray(owner&&owner[category])?owner[category]:[])){out.push({category,id:String(row&&row.id!==undefined?row.id:""),amount:Number(row&&row.amount)||0,date:String(row&&row.date||""),fieldNames:Object.keys(row||{}).filter(k=>!/(photo|image|file|base64|dataurl|email|phone|address|customer|name|notes|description)/i.test(k)).sort(),ownerType});}}return out;};
    const displayField=(obj,keys)=>{for(const key of keys){const value=obj&&obj[key];if(typeof value==="string"&&value.trim())return value.trim();}return "";};
    const projectShape=(project,origin)=>({origin,projectName:displayField(project,["name","projectName","title","jobName"]),customerName:displayField(project,["customerName","clientName","customer","client"]),projectId:String(project&&project.id||""),subprojectCount:Array.isArray(project&&project.subprojects)?project.subprojects.length:0,
     subprojects:(Array.isArray(project&&project.subprojects)?project.subprojects:[]).map(sub=>({name:displayField(sub,["name","title","subprojectName"]),agreedAmount:Number(sub&& (sub.price??sub.amount??sub.contractAmount))||0,id:String(sub&&sub.id||""),income:safeLedgerRows(sub,"subproject"),incomeCount:Array.isArray(sub&&sub.income)?sub.income.length:0,
      categories:Object.fromEntries(["income","expenses","wages","tools","food","contractors","materials","receipts"].map(k=>[k,Array.isArray(sub&&sub[k])?sub[k].length:0]))})),
     rootLedger:safeLedgerRows(project,"project"),rootCategories:Object.fromEntries(["income","expenses","wages","tools","food","contractors","materials","receipts"].map(k=>[k,Array.isArray(project&&project[k])?project[k].length:0]))});
    const srcProjectRows=projects.map(x=>projectShape(x,"LocalStorage"));
    const idbProjectRows=typedProjects.map(x=>projectShape(x,"IndexedDB"));
    const receiptRows=receiptStore.map(x=>({id:String(x.id||""),projectId:String(x.projectId||""),subprojectId:String(x.subprojectId||""),amount:Number(x.amount)||0,date:String(x.date||""),fields:Object.keys(x).filter(k=>!/(photo|image|file|base64|dataurl|email|phone|address|customer|name|notes|description)/i.test(k)).sort()}));
    const expenseRows=expenseStore.map(x=>({id:String(x.id||""),projectId:String(x.projectId||""),subprojectId:String(x.subprojectId||""),amount:Number(x.amount)||0,date:String(x.date||""),fields:Object.keys(x).filter(k=>!/(photo|image|file|base64|dataurl|email|phone|address|customer|name|notes|description)/i.test(k)).sort()}));
    report.domains.projectRelationshipAudit={sourceProjects:srcProjectRows,indexedDBProjects:idbProjectRows,typedProjectReceipts:receiptRows,typedProjectExpenses:expenseRows,
     note:"Projects-only relationship metadata and amounts. Accounting is independent and is not read, compared, linked, imported, or modified by this project audit."};
    report.domains.companyJobFinancialMapping={jobCount:jobs.length,jobs:jobAudit,totals:{packages:jobAudit.reduce((n,x)=>n+x.packageCount,0),payments:jobAudit.reduce((n,x)=>n+x.paymentCount,0),packageExpenses:jobAudit.reduce((n,x)=>n+x.packageExpenseCount,0),paymentNet:Math.round(jobAudit.reduce((n,x)=>n+x.paymentsNet,0)*100)/100},status:"nested Company Job financial data remains inside companyJobs records; no independent typed payment store is currently mapped"};
   }
   report.unmappedSources=["report archive/settings/workflow/email settings","support drafts","monitor log","language and preference version","factory-reset recovery snapshot","invoice cleanup flags","legacy/recovery namespace keys","contracts provenance"];
   report.summary={comparedDomains:Object.keys(report.domains).length,
    domainsWithMissingRecords:Object.values(report.domains).filter(x=>(x.missingFromIndexedDB||0)>0).length,
    domainsWithConflicts:Object.values(report.domains).filter(x=>(x.conflictingSameId||0)>0).length,
    domainsNotYetMapped:report.unmappedSources.length};
   report.notes.push("Full-record equality is intentionally strict. A differing normalized shape is reported as a conflict, not auto-merged.");
   report.safety="Read-only IndexedDB transactions and LocalStorage reads only. No snapshot, write, delete, import, export, or cutover.";
   return report;
  }finally{db.close();}
 }
 root.HandymanSourceIDBReconciliation=Object.freeze({inspect});
})(window);
