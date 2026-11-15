/* THA v250 — read-only conversion planner.
   Reads only the staged legacy domain in the v250 repository.
   It never writes typed domains, LocalStorage, or application data.
*/
(function(root){
 "use strict";
 const DB="the_handyman_accountancy_v250_idb";
 const ENVELOPE="tha-legacy-localstorage-value-v1";
 const MAP={
  "tha_test226_accounting_v1":{domain:"accounting",key:"main",kind:"accounting"},
  "tha_test226_projects_v1":{domain:"projects",key:"main",kind:"projects"},
  "tha_test226_contracts_v1":{domain:"contracts",key:"main",kind:"contracts"},
  "tha_test226_invoice_sequence_v1":{domain:"sequences",key:"invoice",kind:"counter"},
  "tha_test226_isolation_test_record_cleanup_v1":{domain:"maintenance",key:"isolation-test-cleanup",kind:"flag"},
  "tha_test226_invoice_sequence_cleanup_v1":{domain:"maintenance",key:"invoice-sequence-cleanup",kind:"flag"},
  "tha_test226_empty_invoice_sequence_reset_v229":{domain:"maintenance",key:"empty-sequence-reset-v229",kind:"flag"},
  "tha_test226_factory_reset_recovery_v1":{domain:"recovery",key:"factory-reset",kind:"json"},
  "tha_test226_monitor_log_v1":{domain:"diagnostics",key:"monitor-log",kind:"json-array"},
  "tha_test226_report_archive_v1":{domain:"reports",key:"archive",kind:"json"},
  "tha_test226_report_notifications_v1":{domain:"reports",key:"notifications",kind:"json"},
  "tha_test226_report_settings_v1":{domain:"reports",key:"settings",kind:"json"},
  "tha_test226_report_workflow_v1":{domain:"reports",key:"workflow",kind:"json"},
  "tha_test226_report_email_settings_v1":{domain:"reports",key:"email-settings",kind:"json"},
  "tha_test226_help_contact_drafts_v1":{domain:"support",key:"contact-drafts",kind:"json"},
  "tha_test226_app_language_v1":{domain:"preferences",key:"language",kind:"language"},
  "tha_test226_app_language_pref_version_v1":{domain:"preferences",key:"language-pref-version",kind:"pref-version"}
 };
 const array=(v)=>Array.isArray(v);
 const object=(v)=>!!v&&typeof v==="object"&&!Array.isArray(v);
 function duplicates(values){
  const seen=new Set(),dupes=new Set();
  for(const value of values){if(value===undefined||value===null||value==="")continue;const k=String(value);if(seen.has(k))dupes.add(k);seen.add(k);}
  return [...dupes];
 }
 function idCheck(list,label,issues){
  if(!array(list))return;
  const ids=duplicates(list.map(x=>object(x)?x.id:undefined));
  if(ids.length)issues.push({severity:"blocker",code:"duplicate_ids",area:label,values:ids});
  const missing=list.filter(x=>!object(x)||typeof x.id!=="string"||!x.id.trim()).length;
  if(missing)issues.push({severity:"warning",code:"missing_ids",area:label,count:missing});
 }
 function validate(kind,raw,key){
  const issues=[],summary={};
  let value;
  try{value=JSON.parse(raw)}catch(_){
   if(kind==="counter"||kind==="flag"||kind==="language"||kind==="pref-version"){
    value=raw;
   }else{
    return {valid:false,issues:[{severity:"blocker",code:"invalid_json",message:"Value is not valid JSON."}],summary};
   }
  }
  if(kind==="accounting"){
   if(!object(value)||!array(value.entries))issues.push({severity:"blocker",code:"accounting_shape",message:"Expected an object with an entries array."});
   else{
    for(const name of ["customers","invoices","customExpenseCategories"])
     if(value[name]!==undefined&&!array(value[name]))issues.push({severity:"blocker",code:"accounting_array_shape",area:name});
    if(value.settings!==undefined&&!object(value.settings))issues.push({severity:"blocker",code:"accounting_settings_shape"});
    summary.entries=value.entries.length;summary.customers=array(value.customers)?value.customers.length:0;summary.invoices=array(value.invoices)?value.invoices.length:0;
    idCheck(value.customers,"accounting.customers",issues);idCheck(value.invoices,"accounting.invoices",issues);idCheck(value.entries,"accounting.entries",issues);
   }
  }else if(kind==="projects"){
   if(!object(value)||!array(value.projects)||!array(value.workers))issues.push({severity:"blocker",code:"projects_shape",message:"Expected an object with projects and workers arrays."});
   else{
    for(const name of ["partners","contractors","companies","companyJobs"])
     if(value[name]!==undefined&&!array(value[name]))issues.push({severity:"blocker",code:"projects_array_shape",area:name});
    if(value.profile!==undefined&&!object(value.profile))issues.push({severity:"blocker",code:"projects_profile_shape"});
    summary.projects=value.projects.length;summary.workers=value.workers.length;
    for(const name of ["projects","workers","partners","contractors","companies","companyJobs"])
     if(value[name]!==undefined)idCheck(value[name],"projects."+name,issues);
   }
  }else if(kind==="contracts"){
   if(!array(value))issues.push({severity:"blocker",code:"contracts_shape",message:"Expected an array of contract objects."});
   else{
    summary.contracts=value.length;
    if(value.some(x=>!object(x)||typeof x.id!=="string"||!x.id.trim()))
     issues.push({severity:"blocker",code:"contract_id_shape",message:"Every contract must be an object with a non-empty string ID."});
    idCheck(value,"contracts",issues);
   }
  }else if(kind==="counter"){
   const n=Number(value);
   if(!Number.isSafeInteger(n)||n<0)issues.push({severity:"blocker",code:"counter_invalid",message:"Invoice sequence must be a non-negative safe integer."});
   else summary.highWaterMark=n;
  }else if(kind==="flag"){
   if(raw!=="1"&&raw!=="0")issues.push({severity:"warning",code:"flag_unrecognised",message:"Cleanup marker is not the expected literal 1 or 0; preserve without executing."});
   summary.rawValue=raw;
  }else if(kind==="language"){
   if(!["en","fa","ar","ckb","kmr","tr","pl"].includes(raw))issues.push({severity:"warning",code:"language_unrecognised",message:"Language value is not in the app's currently recognised list."});
   summary.language=raw;
  }else if(kind==="pref-version"){
   if(!/^\d+$/.test(raw))issues.push({severity:"warning",code:"preference_version_unrecognised"});
   summary.preferenceVersion=raw;
  }else if(kind==="json-array"){
   if(!array(value))issues.push({severity:"warning",code:"expected_array",message:"Expected an array; retain as legacy until manually reviewed."});
   else summary.items=value.length;
  }else{
   summary.jsonType=array(value)?"array":object(value)?"object":value===null?"null":typeof value;
   if(object(value))summary.topLevelFields=Object.keys(value).length;
   if(array(value))summary.items=value.length;
  }
  return {valid:!issues.some(x=>x.severity==="blocker"),issues,summary,value};
 }
 function invoiceAudit(accounting,sequence){
  const issues=[];
  if(!object(accounting))return {issues,invoiceCount:0,standaloneIncomeCount:0,observedMax:0,sequenceValue:sequence};
  const invoices=array(accounting.invoices)?accounting.invoices:[];
  const entries=array(accounting.entries)?accounting.entries:[];
  const invoiceRows=invoices.map(x=>({number:Number(x&&x.number)||0,id:x&&x.id})).filter(x=>x.number>0);
  const standalone=entries.filter(e=>e&&e.type==="income"&&!e.invoiceId&&!String(e.id||"").startsWith("invoice-income-")&&!/^Invoice\s+/i.test(String(e.reference||"").trim())&&!/payment received for invoice/i.test(String(e.notes||"")));
  const incomeRows=standalone.map(x=>({number:Number(x.number)||0,id:x.id})).filter(x=>x.number>0);
  const invDup=duplicates(invoiceRows.map(x=>x.number));
  const incDup=duplicates(incomeRows.map(x=>x.number));
  const invoiceSet=new Set(invoiceRows.map(x=>x.number));
  const cross=duplicates([...invoiceRows.map(x=>"I:"+x.number),...incomeRows.map(x=>"E:"+x.number)]);
  const crossNumbers=[...new Set(invoiceRows.map(x=>x.number).filter(n=>incomeRows.some(y=>y.number===n)))];
  if(invDup.length)issues.push({severity:"blocker",code:"duplicate_invoice_numbers",numbers:invDup});
  if(incDup.length)issues.push({severity:"blocker",code:"duplicate_standalone_income_numbers",numbers:incDup});
  if(crossNumbers.length)issues.push({severity:"blocker",code:"invoice_income_number_collision",numbers:crossNumbers});
  const observedMax=Math.max(0,...invoiceRows.map(x=>x.number),...incomeRows.map(x=>x.number));
  const sequenceValue=Number(sequence)||0;
  if(sequenceValue<observedMax)issues.push({severity:"blocker",code:"sequence_below_observed_max",sequence:sequenceValue,observedMax});
  return {issues,invoiceCount:invoices.length,standaloneIncomeCount:standalone.length,observedMax,sequenceValue};
 }

 function selfTest(){
  const checks=[];
  const check=(name,condition)=>checks.push({name,ok:!!condition});
  const goodAccounting=validate("accounting",JSON.stringify({entries:[],customers:[],invoices:[]}),"fixture");
  check("valid_accounting_shape",goodAccounting.valid&&goodAccounting.issues.length===0);
  const badAccounting=validate("accounting",JSON.stringify({entries:{}}),"fixture");
  check("reject_invalid_accounting_shape",!badAccounting.valid&&badAccounting.issues.some(x=>x.code==="accounting_shape"));
  const duplicateIds=validate("accounting",JSON.stringify({entries:[],customers:[{id:"c1"},{id:"c1"}],invoices:[]}),"fixture");
  check("detect_duplicate_customer_ids",!duplicateIds.valid&&duplicateIds.issues.some(x=>x.code==="duplicate_ids"));
  const goodProjects=validate("projects",JSON.stringify({projects:[],workers:[]}),"fixture");
  check("valid_projects_shape",goodProjects.valid);
  const badProjects=validate("projects",JSON.stringify({projects:{},workers:[]}),"fixture");
  check("reject_invalid_projects_shape",!badProjects.valid);
  const goodContracts=validate("contracts",JSON.stringify([{id:"contract-1"}]),"fixture");
  check("valid_contract_shape",goodContracts.valid);
  const badContracts=validate("contracts",JSON.stringify([{name:"missing-id"}]),"fixture");
  check("reject_contract_without_id",!badContracts.valid);
  const goodCounter=validate("counter","4","fixture");
  const badCounter=validate("counter","-1","fixture");
  check("accept_nonnegative_counter",goodCounter.valid&&goodCounter.summary.highWaterMark===4);
  check("reject_negative_counter",!badCounter.valid);
  const cleanInvoice=invoiceAudit({invoices:[{id:"i1",number:3}],entries:[{id:"e1",type:"income",number:4}]},4);
  check("accept_noncolliding_invoice_sequence",cleanInvoice.issues.length===0&&cleanInvoice.observedMax===4);
  const duplicateInvoice=invoiceAudit({invoices:[{id:"i1",number:3},{id:"i2",number:3}],entries:[]},3);
  check("detect_duplicate_invoice_numbers",duplicateInvoice.issues.some(x=>x.code==="duplicate_invoice_numbers"));
  const crossCollision=invoiceAudit({invoices:[{id:"i1",number:3}],entries:[{id:"e1",type:"income",number:3}]},3);
  check("detect_invoice_income_number_collision",crossCollision.issues.some(x=>x.code==="invoice_income_number_collision"));
  const lowSequence=invoiceAudit({invoices:[{id:"i1",number:5}],entries:[]},4);
  check("detect_sequence_below_observed_max",lowSequence.issues.some(x=>x.code==="sequence_below_observed_max"));
  const failed=checks.filter(x=>!x.ok);
  return {ok:failed.length===0,mode:"in-memory-self-test",checks,passed:checks.length-failed.length,failed:failed.length,writesPerformed:false,localStorageChanged:false,typedDomainsChanged:false,appCutover:false};
 }

 async function digest(raw){
  try{
   if(!root.crypto||!root.crypto.subtle||!root.TextEncoder)return null;
   const bytes=await root.crypto.subtle.digest("SHA-256",new root.TextEncoder().encode(raw));
   return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,"0")).join("");
  }catch(_){return null;}
 }
 function arrayStats(list){
  if(!array(list))return null;
  const objects=list.filter(object),ids=objects.map(x=>x.id).filter(x=>typeof x==="string"&&x.trim());
  return {count:list.length,objectItems:objects.length,itemsWithId:ids.length,duplicateIdCount:duplicates(ids).length};
 }
 function fieldPresence(list,names){
  if(!array(list))return {};
  const out={};
  for(const name of names)out[name]=list.filter(x=>object(x)&&Object.prototype.hasOwnProperty.call(x,name)).length;
  return out;
 }
 function nestedArrayStats(list,names){
  if(!array(list))return {};
  const out={};
  for(const name of names){
   const values=list.filter(x=>object(x)&&array(x[name])).map(x=>x[name].length);
   out[name]={projectsWithArray:values.length,totalItems:values.reduce((a,b)=>a+b,0)};
  }
  return out;
 }
 async function candidateAudit(rows){
  const selected=rows.filter(row=>row.status==="RETAIN_LEGACY"&&/(account|project|contract|restore|migration)/i.test(row.sourceKey));
  const result=[];
  for(const row of selected){
   const env=row.value,raw=env&&typeof env.raw==="string"?env.raw:"";
   const item={sourceKey:row.sourceKey,rawBytes:new Blob([raw]).size,sha256:await digest(raw),parseable:false};
   let parsed;
   try{parsed=JSON.parse(raw);item.parseable=true}catch(_){item.shape="raw-scalar";result.push(item);continue;}
   if(array(parsed)){
    item.shape="array";item.items=parsed.length;
    item.objectItems=parsed.filter(object).length;
    item.itemsWithId=parsed.filter(x=>object(x)&&typeof x.id==="string"&&x.id.trim()).length;
    item.duplicateIdCount=duplicates(parsed.filter(object).map(x=>x.id).filter(x=>typeof x==="string"&&x.trim())).length;
    if(/monitor/i.test(row.sourceKey))item.family="diagnostics";
    else if(/notification/i.test(row.sourceKey))item.family="notifications";
    else if(/archive/i.test(row.sourceKey))item.family="report-archive";
    else if(/contract/i.test(row.sourceKey))item.family="contracts";
    else item.family="array-unknown";
    item.fieldPresence=fieldPresence(parsed,["id","projectId","project_id","customerId","customer_id","contractId","invoiceId","status","date","createdAt"]);
   }else if(object(parsed)){
    const fields=Object.keys(parsed);
    item.shape="object";item.topLevelFields=fields.length;item.fieldNames=fields.slice(0,40);
    if(array(parsed.entries)||array(parsed.invoices)||array(parsed.customers)){
     item.family="accounting";
     for(const name of ["entries","customers","invoices","customExpenseCategories","thirdPartyTransactions"])
      if(parsed[name]!==undefined)item[name]=arrayStats(parsed[name]);
     item.entryTypeCounts={};
     if(array(parsed.entries))for(const entry of parsed.entries){
      const type=object(entry)&&typeof entry.type==="string"?entry.type:"(missing)";
      item.entryTypeCounts[type]=(item.entryTypeCounts[type]||0)+1;
     }
     item.entryLinkFieldPresence=fieldPresence(parsed.entries,["id","invoiceId","projectId","customerId","contractId","number","date","type"]);
     item.invoiceFieldPresence=fieldPresence(parsed.invoices,["id","number","projectId","customerId","contractId","status","date","createdAt"]);
     const invoiceNumbers=array(parsed.invoices)?parsed.invoices.map(x=>object(x)?Number(x.number):NaN).filter(Number.isSafeInteger):[];
     item.invoiceNumberAudit={numberedInvoices:invoiceNumbers.length,duplicateNumbers:duplicates(invoiceNumbers).length,maximumNumber:Math.max(0,...invoiceNumbers)};
    }else if(array(parsed.projects)||array(parsed.workers)){
     item.family="projects";
     for(const name of ["projects","workers","partners","contractors","companies","companyJobs"])
      if(parsed[name]!==undefined)item[name]=arrayStats(parsed[name]);
     item.projectFieldPresence=fieldPresence(parsed.projects,["id","customerId","contractId","status","name","createdAt","updatedAt"]);
     item.projectNestedArrays=nestedArrayStats(parsed.projects,["subprojects","subProjects","expenses","materials","receipts","payments","invoices","images","documents"]);
    }else{
     item.family="object-unknown";
     item.fieldPresence=fieldPresence([parsed],["entries","invoices","projects","workers","contracts","settings","profile"]);
    }
   }else{item.shape=parsed===null?"null":typeof parsed;item.family="scalar";}
   result.push(item);
  }
  const groups={};
  for(const item of result){
   if(!item.sha256)continue;
   const key=item.sha256;
   if(!groups[key])groups[key]=[];
   groups[key].push(item.sourceKey);
  }
  const exactDuplicateGroups=Object.values(groups).filter(names=>names.length>1);
  return {candidates:result,exactDuplicateGroups};
 }

 function stable(value){
  if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
  if(object(value))return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
  return JSON.stringify(value);
 }
 function compareArrays(a,b){
  if(!array(a)||!array(b))return null;
  const mapA=new Map(),mapB=new Map();
  let missingIdA=0,missingIdB=0;
  for(const item of a){if(object(item)&&typeof item.id==="string"&&item.id.trim())mapA.set(item.id,item);else missingIdA++;}
  for(const item of b){if(object(item)&&typeof item.id==="string"&&item.id.trim())mapB.set(item.id,item);else missingIdB++;}
  const common=[...mapA.keys()].filter(id=>mapB.has(id));
  let identical=0,changed=0;
  const changedFieldCounts={};
  for(const id of common){
   const left=mapA.get(id),right=mapB.get(id);
   if(stable(left)===stable(right)){identical++;continue;}
   changed++;
   const keys=new Set([...Object.keys(left),...Object.keys(right)]);
   for(const key of keys)if(stable(left[key])!==stable(right[key]))changedFieldCounts[key]=(changedFieldCounts[key]||0)+1;
  }
  return {countA:a.length,countB:b.length,idsA:mapA.size,idsB:mapB.size,commonIds:common.length,identicalRecords:identical,changedRecordsSameId:changed,changedFieldCounts,onlyInA:[...mapA.keys()].filter(id=>!mapB.has(id)).length,onlyInB:[...mapB.keys()].filter(id=>!mapA.has(id)).length,missingIdA,missingIdB,duplicateIdsA:a.length-mapA.size-missingIdA,duplicateIdsB:b.length-mapB.size-missingIdB};
 }
 function parsedRows(rows){
  const out=new Map();
  for(const row of rows){const env=row.value;if(!env||typeof env.raw!=="string")continue;try{out.set(row.key,JSON.parse(env.raw))}catch(_){}}
  return out;
 }
 function candidateSequenceAudit(rows){
  const byKey=new Map(rows.map(row=>[row.key,row.value&&row.value.raw]));
  const pairs=[
   {accounting:"handyman_accounting_v2",sequence:null},
   {accounting:"tha_restore_test_v1_accounting_v1",sequence:"tha_restore_test_v1_invoice_sequence_v1"},
   {accounting:"tha_v212_migration_accounting_v1",sequence:"tha_v212_migration_invoice_sequence_v1"},
   {accounting:"tha_test226_accounting_v1",sequence:"tha_test226_invoice_sequence_v1"}
  ];
  return pairs.map(pair=>{
   let data=null,sequence=null;
   try{const raw=byKey.get(pair.accounting);if(typeof raw==="string")data=JSON.parse(raw)}catch(_){}
   try{const raw=pair.sequence?byKey.get(pair.sequence):null;if(typeof raw==="string")sequence=Number(JSON.parse(raw))}catch(_){}
   const invoices=array(data&&data.invoices)?data.invoices:[];
   const entries=array(data&&data.entries)?data.entries:[];
   const invoiceNumbers=invoices.map(x=>Number(x&&x.number)).filter(n=>Number.isFinite(n)&&n>0);
   const entryNumbers=entries.map(x=>Number(x&&x.number)).filter(n=>Number.isFinite(n)&&n>0);
   const observedMax=Math.max(0,...invoiceNumbers,...entryNumbers);
   return {accountingSource:pair.accounting,sequenceSource:pair.sequence,invoiceCount:invoices.length,numberedInvoiceCount:invoiceNumbers.length,numberedEntryCount:entryNumbers.length,observedMax,sequenceValue:sequence,sequenceBelowObservedMax:sequence===null?null:sequence<observedMax};
  });
 }
 function compactAuditRecord(item){
  if(!object(item))return item;
  const out={};
  for(const key of ["number","date","createdAt","updatedAt","type","amount","category","method","status","paymentStatus","paymentDate","paymentMethod","income","expenses","wages","price","total","name","title","label"])
   if(Object.prototype.hasOwnProperty.call(item,key)&&["string","number","boolean"].includes(typeof item[key]))out[key]=item[key];
  if(array(item.items)){
   const prices=item.items.map(x=>Number(x&&x.price)).filter(Number.isFinite);
   out.items={count:item.items.length,pricedItems:prices.length,totalPrice:Math.round(prices.reduce((a,b)=>a+b,0)*100)/100};
  }
  if(array(item.subprojects))out.subprojects={count:item.subprojects.length};
  if(array(item.expenses)){
   const amounts=item.expenses.map(x=>Number(x&&((x.amount??x.price??x.total)))).filter(Number.isFinite);
   out.expenses={count:item.expenses.length,amountCount:amounts.length,totalAmount:Math.round(amounts.reduce((a,b)=>a+b,0)*100)/100};
  }
  if(array(item.materials))out.materials={count:item.materials.length};
  return out;
 }
 function auditFinancialValue(value){
  if(value===null||value===undefined)return {present:false};
  if(typeof value==="number")return {present:true,type:"number",value:Number.isFinite(value)?value:null};
  if(typeof value==="string"){
   const n=Number(value);
   return {present:true,type:"string",numericValue:value.trim()!==""&&Number.isFinite(n)?n:null};
  }
  if(array(value)){
   const rows=value.filter(object);
   const amountRows=rows.map(x=>Number(x.amount??x.price??x.total??x.value)).filter(Number.isFinite);
   return {present:true,type:"array",count:value.length,objectItems:rows.length,amountCount:amountRows.length,amountTotal:Math.round(amountRows.reduce((a,b)=>a+b,0)*100)/100};
  }
  if(object(value)){
   const out={present:true,type:"object"};
   for(const key of ["amount","total","value","paid","unpaid","price","rate","percentage","count"])
    if(Object.prototype.hasOwnProperty.call(value,key)&&["number","string","boolean"].includes(typeof value[key]))out[key]=value[key];
   for(const key of ["items","payments","transactions","records"])
    if(array(value[key]))out[key]=auditFinancialValue(value[key]);
   return out;
  }
  return {present:true,type:typeof value};
 }
 function projectFinancialAudit(project){
  const subprojects=array(project&&project.subprojects)?project.subprojects:[];
  const prices=subprojects.map(x=>Number(x&&x.price)).filter(Number.isFinite);
  const expenses=subprojects.flatMap(x=>array(x&&x.expenses)?x.expenses:[]);
  const expenseAmounts=expenses.map(x=>Number(x&&((x.amount??x.price??x.total)))).filter(Number.isFinite);
  return {
   projectPrice:auditFinancialValue(project&&project.price),
   projectIncome:auditFinancialValue(project&&project.income),
   projectExpenses:auditFinancialValue(project&&project.expenses),
   projectWages:auditFinancialValue(project&&project.wages),
   partnerShare:auditFinancialValue(project&&project.partnerShare),
   subprojectCount:subprojects.length,
   subprojectPriceTotal:Math.round(prices.reduce((a,b)=>a+b,0)*100)/100,
   subprojectExpenseCount:expenses.length,
   subprojectExpenseAmountCount:expenseAmounts.length,
   subprojectExpenseTotal:Math.round(expenseAmounts.reduce((a,b)=>a+b,0)*100)/100,
   subprojectPriceMinusProjectPrice:prices.length&&Number.isFinite(Number(project&&project.price))?Math.round((prices.reduce((a,b)=>a+b,0)-Number(project.price))*100)/100:null
  };
 }
 function projectDetailAudit(rows){
  const values=parsedRows(rows);
  const keys=["handyman_projects_workspace_v1","tha_restore_test_v1_projects_v1","tha_v212_migration_projects_v1"];
  return keys.map(sourceKey=>{
   const data=values.get(sourceKey);
   const projects=array(data&&data.projects)?data.projects:[];
   return {
    sourceKey,
    projects:projects.map(project=>({
     id:project&&project.id,
     summary:compactAuditRecord(project),
     financialAudit:projectFinancialAudit(project),
     subprojects:(array(project&&project.subprojects)?project.subprojects:[]).map(sub=>({
      id:sub&&sub.id,
      summary:compactAuditRecord(sub),
      financialFields:{
       price:auditFinancialValue(sub&&sub.price),
       income:auditFinancialValue(sub&&sub.income),
       expenses:auditFinancialValue(sub&&sub.expenses),
       wages:auditFinancialValue(sub&&sub.wages),
       partnerShare:auditFinancialValue(sub&&sub.partnerShare)
      }
     }))
    }))
   };
  });
 }
 function compareArrayDetails(a,b){
  if(!array(a)||!array(b))return null;
  const left=new Map(a.filter(x=>object(x)&&typeof x.id==="string"&&x.id.trim()).map(x=>[x.id,x]));
  const right=new Map(b.filter(x=>object(x)&&typeof x.id==="string"&&x.id.trim()).map(x=>[x.id,x]));
  const changed=[];
  for(const [id,x] of left){
   if(!right.has(id))continue;
   const y=right.get(id);
   if(stable(x)===stable(y))continue;
   const xa=compactAuditRecord(x),yb=compactAuditRecord(y);
   const fields=[...new Set([...Object.keys(xa),...Object.keys(yb)])].filter(k=>stable(xa[k])!==stable(yb[k]));
   changed.push({id,changedFields:fields,left:xa,right:yb});
  }
  return {changed,onlyLeft:[...left.keys()].filter(id=>!right.has(id)),onlyRight:[...right.keys()].filter(id=>!left.has(id))};
 }
 function candidateRecordDiffs(rows){
  const values=parsedRows(rows);
  const get=(key)=>values.get(key);
  const restore=get("tha_restore_test_v1_accounting_v1"),v212=get("tha_v212_migration_accounting_v1");
  const hand=get("handyman_accounting_v2");
  const restoreProjects=get("tha_restore_test_v1_projects_v1"),v212Projects=get("tha_v212_migration_projects_v1");
  const handProjects=get("handyman_projects_workspace_v1");
  const result={
   accountingRestoreVsV212:restore&&v212?{
    entries:compareArrayDetails(restore.entries,v212.entries),
    invoices:compareArrayDetails(restore.invoices,v212.invoices)
   }:null,
   accountingHandymanVsV212:hand&&v212?{
    entries:compareArrayDetails(hand.entries,v212.entries),
    invoices:compareArrayDetails(hand.invoices,v212.invoices)
   }:null,
   projectsRestoreVsV212:restoreProjects&&v212Projects?{
    projects:compareArrayDetails(restoreProjects.projects,v212Projects.projects),
    subprojects:compareArrayDetails(restoreProjects.projects&&restoreProjects.projects[0]&&restoreProjects.projects[0].subprojects,v212Projects.projects&&v212Projects.projects[0]&&v212Projects.projects[0].subprojects)
   }:null,
   projectsWorkspaceVsV212:handProjects&&v212Projects?{
    projects:compareArrayDetails(handProjects.projects,v212Projects.projects),
    subprojects:compareArrayDetails(handProjects.projects&&handProjects.projects[0]&&handProjects.projects[0].subprojects,v212Projects.projects&&v212Projects.projects[0]&&v212Projects.projects[0].subprojects)
   }:null
  };
  return result;
 }
 function candidateDateCoverage(rows){
  const keys=["handyman_accounting_v2","tha_restore_test_v1_accounting_v1","tha_v212_migration_accounting_v1","handyman_projects_workspace_v1","tha_restore_test_v1_projects_v1","tha_v212_migration_projects_v1"];
  const values=parsedRows(rows),result=[];
  for(const key of keys){
   const data=values.get(key);if(!data)continue;
   const dates=[];
   const collect=list=>{if(!array(list))return;for(const x of list)if(object(x))for(const f of ["date","createdAt","updatedAt","paymentDate"])if(typeof x[f]==="string"&&x[f])dates.push(x[f]);};
   if(object(data)){collect(data.entries);collect(data.invoices);collect(data.projects);collect(data.projects&&data.projects[0]&&data.projects[0].subprojects);}
   const sorted=dates.slice().sort();
   result.push({sourceKey:key,datedFieldCount:dates.length,earliest:sorted[0]||null,latest:sorted[sorted.length-1]||null});
  }
  return result;
 }
 function candidateMigrationGate(sequenceAudit){
  const rows=Array.isArray(sequenceAudit)?sequenceAudit:[];
  const maxObserved=Math.max(0,...rows.map(x=>Number(x.observedMax)||0));
  const maxSequence=Math.max(0,...rows.map(x=>Number(x.sequenceValue)||0));
  const selected=rows.find(x=>x.accountingSource==="tha_v212_migration_accounting_v1");
  const test226=rows.find(x=>x.accountingSource==="tha_test226_accounting_v1");
  const reasons=[
   "The active source of truth has not been proven from the candidate snapshots.",
   "The current typed-domain mapping points to test226, which contains a lower invoice-number range than the v212 and restore candidates.",
   "The handyman accounting candidate has no matching sequence key in the audited candidate set."
  ];
  return {
   readyForTypedMigration:false,
   sourceOfTruthConfirmed:false,
   globalObservedMax:maxObserved,
   globalSequenceHighWaterMark:maxSequence,
   conservativeNextNumber:maxObserved+1,
   v212Candidate:selected?{observedMax:selected.observedMax,sequenceValue:selected.sequenceValue}:null,
   test226Candidate:test226?{observedMax:test226.observedMax,sequenceValue:test226.sequenceValue}:null,
   reasons
  };
 }
 function compareCandidateVersions(rows){
  const values=parsedRows(rows);
  const specs=[
   {name:"accounting: handyman vs restore",a:"handyman_accounting_v2",b:"tha_restore_test_v1_accounting_v1",fields:["entries","customers","invoices"]},
   {name:"accounting: restore vs v212",a:"tha_restore_test_v1_accounting_v1",b:"tha_v212_migration_accounting_v1",fields:["entries","customers","invoices","customExpenseCategories","thirdPartyTransactions"]},
   {name:"accounting: handyman vs v212",a:"handyman_accounting_v2",b:"tha_v212_migration_accounting_v1",fields:["entries","customers","invoices"]},
   {name:"projects: workspace vs restore",a:"handyman_projects_workspace_v1",b:"tha_restore_test_v1_projects_v1",fields:["projects","workers","partners","contractors","companies","companyJobs"]},
   {name:"projects: restore vs v212",a:"tha_restore_test_v1_projects_v1",b:"tha_v212_migration_projects_v1",fields:["projects","workers","partners","contractors","companies","companyJobs"]},
   {name:"projects: workspace vs v212",a:"handyman_projects_workspace_v1",b:"tha_v212_migration_projects_v1",fields:["projects","workers","partners","contractors","companies","companyJobs"]},
   {name:"contracts: restore vs v212",a:"tha_restore_test_v1_contracts_v1",b:"tha_v212_migration_contracts_v1",fields:null}
  ];
  return specs.map(spec=>{
   const a=values.get(spec.a),b=values.get(spec.b);
   if(a===undefined||b===undefined)return {comparison:spec.name,available:false};
   if(!spec.fields)return {comparison:spec.name,available:true,records:compareArrays(a,b)};
   const result={comparison:spec.name,available:true,fields:{}};
   for(const field of spec.fields)if(array(a&&a[field])||array(b&&b[field]))result.fields[field]=compareArrays(a&&a[field],b&&b[field]);
   if(array(a&&a.projects)&&array(b&&b.projects)){
    const pa=a.projects[0],pb=b.projects[0];
    if(object(pa)&&object(pb)){result.subprojects=compareArrays(pa.subprojects,pb.subprojects);result.projectSameId=String(pa.id||"")===String(pb.id||"");}
   }
   return result;
  });
 }

 async function plan(){
  const api=root.HandymanStorageRepository;
  if(!api||api.databaseName!==DB||typeof api.snapshot!=="function")
   throw new Error("The v250 IndexedDB repository is not loaded.");
  const snap=await api.snapshot(["legacy"]);
  if(!snap||snap.format!=="tha-idb-repository-snapshot-v1"||snap.database!==DB||!array(snap.records))
   throw new Error("Could not read a valid v250 legacy snapshot.");
  const rows=snap.records.map(row=>{
   const env=row.value;
   if(!object(env)||env.format!==ENVELOPE||env.sourceKey!==row.key||typeof env.raw!=="string")
    return {sourceKey:row.key,classification:"invalid-envelope",status:"BLOCKED",issues:[{severity:"blocker",code:"legacy_envelope_invalid"}]};
   const mapping=MAP[row.key];
   if(!mapping)return {sourceKey:row.key,classification:"unmapped",status:"RETAIN_LEGACY",rawBytes:new Blob([env.raw]).size,issues:[]};
   const checked=validate(mapping.kind,env.raw,row.key);
   return {sourceKey:row.key,target:{domain:mapping.domain,key:mapping.key},kind:mapping.kind,status:checked.valid?(checked.issues.length?"REVIEW":"READY"):"BLOCKED",rawBytes:new Blob([env.raw]).size,summary:checked.summary,issues:checked.issues};
  });
  const findRaw=key=>{const row=snap.records.find(x=>x.key===key);return row&&row.value&&row.value.format===ENVELOPE?row.value.raw:null;};
  let accounting=null,sequence=null;
  try{const raw=findRaw("tha_test226_accounting_v1");if(raw!==null)accounting=JSON.parse(raw)}catch(_){}
  try{const raw=findRaw("tha_test226_invoice_sequence_v1");if(raw!==null)sequence=Number(raw)}catch(_){}
  const invoice=invoiceAudit(accounting,sequence);
  const candidates=await candidateAudit(snap.records.map(row=>({sourceKey:row.key,value:row.value,status:MAP[row.key]?"MAPPED":"RETAIN_LEGACY"})));
  const sourceComparisons=compareCandidateVersions(snap.records);
  const sequenceAudit=candidateSequenceAudit(snap.records);
  const migrationGate=candidateMigrationGate(sequenceAudit);
  const issues=rows.flatMap(x=>x.issues.map(issue=>({...issue,sourceKey:x.sourceKey}))).concat(invoice.issues);
  const blockers=issues.filter(x=>x.severity==="blocker").length;
  const warnings=issues.filter(x=>x.severity==="warning").length;
  const ready=rows.filter(x=>x.status==="READY").length;
  const review=rows.filter(x=>x.status==="REVIEW").length;
  const blocked=rows.filter(x=>x.status==="BLOCKED").length;
  const unmapped=rows.filter(x=>x.status==="RETAIN_LEGACY").length;
  return {
   ok:blockers===0,
   mode:"read-only",
   database:DB,
   legacyRecordCount:rows.length,
   mappedCount:rows.filter(x=>x.target).length,
   readyCount:ready,
   reviewCount:review,
   blockedCount:blocked,
   unmappedCount:unmapped,
   invoiceReconciliation:{...invoice,scope:"tha_test226_accounting_v1 only; not a reconciliation of all candidate sources"},
   candidateMigrationGate:migrationGate,
   candidateAudit:candidates.candidates,
   exactDuplicateGroups:candidates.exactDuplicateGroups,
   sourceComparisons,
   candidateSequenceAudit:sequenceAudit,
   candidateRecordDiffs:candidateRecordDiffs(snap.records),
   projectDetailAudit:projectDetailAudit(snap.records),
   candidateDateCoverage:candidateDateCoverage(snap.records),
   issues,
   records:rows,
   writesPerformed:false,
   localStorageChanged:false,
   typedDomainsChanged:false,
   appCutover:false,
   note:"This planner only reads the v250 legacy domain. It does not create or modify typed domain records."
  };
 }
 root.HandymanV250ConversionPlanner=Object.freeze({plan,selfTest});
})(window);
