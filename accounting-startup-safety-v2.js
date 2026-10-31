/* Accounting startup safety — isolated, opt-in migration planner.
 * Not referenced by index.html. Does not read or write browser storage.
 * No Projects, Company, Contracts, or production data are accessed.
 */
(function(root){
 'use strict';
 function inspect(db){
  if(!db||typeof db!=='object'||!Array.isArray(db.entries)||!Array.isArray(db.invoices)){
   throw new Error('Invalid Accounting DB; startup migration inspection refused.');
  }
  const invoiceNumbers=new Set(db.invoices.map(i=>String(i&&i.number||'').trim()).filter(Boolean));
  const orphanIds=[];
  for(const e of db.entries){
   if(!e||e.type!=='income')continue;
   const ref=String(e.reference||'').trim().match(/^Invoice\s+(.+)$/i);
   const note=String(e.notes||'').match(/payment received for invoice\s+([\w-]+)/i);
   const id=String(e.id||'').match(/^invoice-income-invoice-(.+)$/i);
   const number=ref&&ref[1].trim()||note&&note[1].trim()||id&&id[1].trim();
   if(number&&!invoiceNumbers.has(String(number))&&(ref||note||id))orphanIds.push(String(e.id||''));
  }
  const numbered=db.entries.filter(e=>e&&e.type==='income'&&!e.invoiceId&&!(Number(e.number)>0));
  return Object.freeze({
   valid:true,
   unnumberedIncomeCount:numbered.length,
   orphanInvoiceIncomeIds:Object.freeze(orphanIds),
   changesRequired:numbered.length>0||orphanIds.length>0,
   automaticMutation:false
  });
 }
 function apply(db,plan,options){
  if(!options||options.explicitApproval!==true)throw new Error('Explicit approval is required; no Accounting data was changed.');
  if(!plan||plan.valid!==true||!Array.isArray(plan.orphanInvoiceIncomeIds))throw new Error('A valid inspection plan is required.');
  if(!db||!Array.isArray(db.entries)||!Array.isArray(db.invoices))throw new Error('Invalid Accounting DB.');
  const snapshot=JSON.stringify(db);
  try{
   const invoiceNumbers=new Set(db.invoices.map(i=>String(i&&i.number||'').trim()).filter(Boolean));
   const orphanSet=new Set(plan.orphanInvoiceIncomeIds);
   db.entries=db.entries.filter(e=>!(e&&e.type==='income'&&orphanSet.has(String(e.id||''))));
   const highest=Math.max(142,134,0,...db.invoices.map(i=>Number(i&&i.number)||0),...db.entries.filter(e=>e&&e.type==='income').map(e=>Number(e.number)||0));
   let next=highest+1;
   const unnumbered=db.entries.filter(e=>e&&e.type==='income'&&!e.invoiceId&&!(Number(e.number)>0))
    .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id||'').localeCompare(String(b.id||'')));
   for(const e of unnumbered)e.number=next++;
   return {applied:true,removedOrphans:orphanSet.size,numberedIncome:unnumbered.length};
  }catch(error){
   const old=JSON.parse(snapshot);
   db.entries=old.entries;
   throw new Error('Migration failed; in-memory Accounting entries were rolled back. '+String(error&&error.message||error));
  }
 }
 root.HandymanAccountingStartupSafety=Object.freeze({inspect,apply});
})(typeof window!=='undefined'?window:globalThis);
