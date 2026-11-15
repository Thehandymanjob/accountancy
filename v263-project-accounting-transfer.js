/* THA v263 approved project-to-accounting transfer service.
   Atomic cross-domain writes. Project source ledger remains intact for P&L; transfer metadata prevents duplicates. */
(function(root){
 "use strict";
 const api=()=>{if(!root.HandymanAppStorageV263)throw new Error("v263 storage adapter unavailable.");return root.HandymanAppStorageV263;};
 const clone=x=>root.structuredClone(x);
 const incomeCollections=new Set(["income"]),expenseCollections=new Set(["expenses","wages","tools","food","contractors","materials"]);
 function locate(projects,projectId,subprojectId,collection,recordId){
  const p=projects.projects.find(x=>String(x.id)===String(projectId));if(!p)throw new Error("Project not found.");
  const ledger=subprojectId?(p.subprojects||[]).find(x=>String(x.id)===String(subprojectId)):p;if(!ledger)throw new Error("Sub-project not found.");
  if(!incomeCollections.has(collection)&&!expenseCollections.has(collection))throw new Error("Unsupported transfer source collection.");
  const list=ledger[collection];if(!Array.isArray(list))throw new Error("Project ledger collection not found.");
  const record=list.find(x=>String(x.id)===String(recordId));if(!record)throw new Error("Source ledger record not found.");
  return {project:p,ledger,record};
 }
 async function transfer(args){
  if(!args||args.approved!==true)throw new Error("Explicit approval is required before transfer.");
  const {projectId,subprojectId=null,collection,recordId}=args;
  if(!projectId||!recordId)throw new Error("Project ID and source record ID are required.");
  const id="project-transfer:"+String(projectId)+":"+String(subprojectId||"main")+":"+String(collection)+":"+String(recordId);
  const storage=api();await storage.initialize();
  const [projects,accounting]=await Promise.all([storage.read("projects"),storage.read("accounting")]);
  const {project,ledger,record}=locate(projects,projectId,subprojectId,collection,recordId);
  if(record.transferredToAccounting===true||record.accountingTransferId)throw new Error("This source record has already been transferred.");
  const amount=Math.round((Number(record.amount)||0)*100)/100;
  if(!(amount>0))throw new Error("Source amount must be greater than zero.");
  const type=incomeCollections.has(collection)?"income":"expense";
  const entry={id,type,date:String(record.date||record.paymentDate||new Date().toISOString().slice(0,10)),amount,method:record.method||record.paymentMethod||"bank",category:String(record.category||record.description||collection),reference:String(record.reference||record.description||("Project "+project.name)),notes:"Approved project transfer · "+String(project.name)+(subprojectId?" / "+String(ledger.name):""),projectId:String(projectId),subprojectId:subprojectId?String(subprojectId):"",projectSourceCollection:collection,projectSourceRecordId:String(recordId),projectTransferId:id,createdAt:new Date().toISOString()};
  const updatedProjects=clone(projects),updatedAccounting=clone(accounting);
  const target=locate(updatedProjects,projectId,subprojectId,collection,recordId).record;
  target.transferredToAccounting=true;target.accountingTransferId=id;target.accountingTransferredAt=new Date().toISOString();
  if(updatedAccounting.entries.some(x=>String(x.projectTransferId||"")===id||String(x.id)===id))throw new Error("Matching accounting transfer already exists; duplicate blocked.");
  updatedAccounting.entries.push({...entry,id});
  const result=await storage.writeMany({projects:updatedProjects,accounting:updatedAccounting});
  if(!result||result.ok!==true)throw new Error("Atomic project/accounting transfer was not confirmed.");
  const [p2,a2]=await Promise.all([storage.read("projects"),storage.read("accounting")]);
  const source=locate(p2,projectId,subprojectId,collection,recordId).record;
  const posted=a2.entries.find(x=>String(x.projectTransferId||"")===id);
  if(!source.transferredToAccounting||source.accountingTransferId!==id||!posted||posted.amount!==amount||posted.type!==type)throw new Error("Cross-domain transfer read-back verification failed.");
  return {ok:true,transferId:id,amount,type,accountingEntryId:posted.id,sourceRetained:true,projectPnlSourceUnchanged:true};
 }
 root.HandymanProjectAccountingTransferV263=Object.freeze({transfer});
})(window);
