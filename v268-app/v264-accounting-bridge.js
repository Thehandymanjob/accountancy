/* THA v264 async Accounting/Invoice bridge for the preserved v262 UI.
   This is an in-memory view-model facade over the IndexedDB-only controllers.
   It is not a synchronous storage shim and never accesses browser Storage APIs.
*/
(function(root){
 "use strict";
 const BUILD="THA-264-ACCOUNTING-BRIDGE-1";
 const accounting=()=>{const x=root.HandymanAccountingV264;if(!x)throw new Error("v264 Accounting controller is unavailable.");return x;};
 const invoices=()=>{const x=root.HandymanInvoiceWorkflowV264;if(!x)throw new Error("v264 Invoice workflow is unavailable.");return x;};
 const clone=value=>root.structuredClone(value);
 const listeners=new Set();
 let state=null,initialized=false,queue=Promise.resolve();
 function assertReady(){if(!initialized||!state)throw new Error("Accounting bridge has not completed IndexedDB initialization.");}
 function publish(next){state=clone(next);for(const fn of listeners){try{fn(clone(state));}catch(error){setTimeout(()=>{throw error;},0);}}return clone(state);}
 async function refresh(){const next=await accounting().load();initialized=true;return publish(next);}
 async function initialize(){await accounting().initialize();return refresh();}
 function getState(){assertReady();return clone(state);}
 function subscribe(fn){if(typeof fn!=="function")throw new Error("A state listener function is required.");listeners.add(fn);return ()=>listeners.delete(fn);}
 function serialize(work){
  const run=queue.then(work);
  queue=run.catch(()=>{});
  return run;
 }
 async function update(mutator){
  assertReady();
  return serialize(async()=>{const result=await accounting().update(mutator);if(!result||result.ok!==true)throw new Error("IndexedDB Accounting mutation was not confirmed.");return publish(result.state);});
 }
 async function saveEntry(entry){
  if(!entry||typeof entry!=="object"||!entry.id)throw new Error("A stable entry ID is required.");
  return update(s=>{const i=s.entries.findIndex(x=>String(x.id)===String(entry.id));if(i<0)s.entries.push(clone(entry));else s.entries[i]={...s.entries[i],...clone(entry),id:s.entries[i].id};return s;});
 }
 async function deleteEntry(id){return update(s=>{const item=s.entries.find(x=>String(x.id)===String(id));if(!item)throw new Error("Entry not found.");if(item.invoiceId)throw new Error("Invoice-linked income must be changed through the invoice payment workflow.");s.entries=s.entries.filter(x=>String(x.id)!==String(id));return s;});}
 async function saveCustomer(customer){return serialize(async()=>{await accounting().saveCustomer(customer);return refresh();});}
 async function deleteCustomer(id){return serialize(async()=>{await accounting().deleteCustomer(id);return refresh();});}
 async function saveInvoice(invoice,payment,customerOverride){
  if(!invoice||typeof invoice!=="object")throw new Error("Invoice data is required.");
  return serialize(async()=>{const snapshot=getState(),customer=customerOverride||snapshot.customers.find(x=>String(x.id)===String(invoice.customerId))||null;
   const result=await invoices().saveInvoice(invoice,payment,customer);
   if(!result||result.ok!==true)throw new Error("Invoice workflow did not confirm the save.");
   return {result,state:await refresh()};
  });
 }
 async function markInvoicePaid(id,payment){return serialize(async()=>{const result=await invoices().markPaid(id,payment);return {result,state:await refresh()};});}
 async function markInvoiceUnpaid(id){return serialize(async()=>{const result=await invoices().markUnpaid(id);return {result,state:await refresh()};});}
 async function deleteInvoice(id){return serialize(async()=>{const result=await invoices().softDelete(id);return {result,state:await refresh()};});}
 async function reserveInvoiceNumber(){
  const s=getState(),highest=Math.max(0,...s.invoices.map(x=>Number(x.number)||0),...s.entries.filter(x=>x.type==="income").map(x=>Number(x.number)||0));
  return accounting().reserveInvoiceNumber(highest);
 }
 async function saveSettings(patch){
  if(!patch||typeof patch!=="object"||Array.isArray(patch))throw new Error("Settings patch is required.");
  return update(s=>{s.settings={...(s.settings||{}),...clone(patch)};return s;});
 }
 const api=Object.freeze({
  build:BUILD,mode:"indexeddb-only",initialize,refresh,getState,subscribe,
  saveEntry,deleteEntry,saveCustomer,deleteCustomer,saveInvoice,
  markInvoicePaid,markInvoiceUnpaid,deleteInvoice,reserveInvoiceNumber,saveSettings
 });
 root.HandymanV264AccountingBridge=api;
})(window);
