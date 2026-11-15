/* THA v264 accounting UI operations.
   Small async command layer for migrating UI handlers without sync storage shims.
   It does not access browser storage directly and never touches project domains.
*/
(function(root){
 "use strict";
 const bridge=()=>{const x=root.HandymanAccountingUIBridgeV264;if(!x||!x.initialized)throw new Error("IndexedDB accounting bridge is not ready.");return x;};
 const clone=x=>root.structuredClone(x);
 const requiredState=x=>{if(!x||!Array.isArray(x.entries)||!Array.isArray(x.customers)||!Array.isArray(x.invoices))throw new Error("Invalid accounting state.");return x;};
 async function saveEntry(entry){
  if(!entry||!entry.id||!entry.date||!(Number(entry.amount)>0)||!["income","expense"].includes(entry.type))throw new Error("Entry requires ID, date, positive amount and valid type.");
  const result=await bridge().mutate(state=>{
   const i=state.entries.findIndex(x=>String(x.id)===String(entry.id));
   if(i<0)state.entries.push(clone(entry));else state.entries[i]={...state.entries[i],...clone(entry),id:state.entries[i].id};
   return state;
  });
  if(!result.verified)throw new Error("Entry save was not read-back verified.");
  return {ok:true,verified:true,state:requiredState(result.state)};
 }
 async function deleteEntry(id){
  const result=await bridge().mutate(state=>{
   const item=state.entries.find(x=>String(x.id)===String(id));
   if(!item)throw new Error("Entry not found.");
   if(item.invoiceId)throw new Error("Invoice-linked income must be managed through invoice payment controls.");
   state.entries=state.entries.filter(x=>String(x.id)!==String(id));return state;
  });
  if(!result.verified)throw new Error("Entry deletion was not read-back verified.");
  return {ok:true,verified:true,state:requiredState(result.state)};
 }
 async function saveCustomer(customer){
  if(!customer||!customer.id||!String(customer.name||"").trim())throw new Error("Customer ID and name are required.");
  const result=await bridge().mutate(state=>{
   const i=state.customers.findIndex(x=>String(x.id)===String(customer.id));
   if(i<0)state.customers.push(clone(customer));else state.customers[i]=clone(customer);
   return state;
  });
  if(!result.verified)throw new Error("Customer save was not read-back verified.");
  return {ok:true,verified:true,state:requiredState(result.state)};
 }
 async function deleteCustomer(id){
  const result=await bridge().mutate(state=>{
   if(state.invoices.some(x=>String(x.customerId)===String(id)))throw new Error("Customer is linked to a saved invoice.");
   state.customers=state.customers.filter(x=>String(x.id)!==String(id));return state;
  });
  if(!result.verified)throw new Error("Customer deletion was not read-back verified.");
  return {ok:true,verified:true,state:requiredState(result.state)};
 }
 async function saveInvoice(invoice,payment,customer){
  const workflow=root.HandymanInvoiceWorkflowV264;
  if(!workflow||typeof workflow.saveInvoice!=="function")throw new Error("IndexedDB invoice workflow is unavailable.");
  const result=await workflow.saveInvoice(clone(invoice),payment?clone(payment):null,customer?clone(customer):null);
  const state=await bridge().load();
  const saved=state.invoices.find(x=>String(x.id)===String(invoice.id));
  if(!saved||String(saved.number)!==String(result.number))throw new Error("Invoice save read-back verification failed.");
  return {ok:true,verified:true,state,invoice:clone(saved)};
 }
 async function invoiceAction(action,id,payment){
  const workflow=root.HandymanInvoiceWorkflowV264;
  if(!workflow||typeof workflow[action]!=="function")throw new Error("IndexedDB invoice action is unavailable: "+action);
  const result=await workflow[action](String(id),payment?clone(payment):undefined);
  const state=await bridge().load();
  if(!result||result.ok!==true)throw new Error("Invoice action was not confirmed: "+action);
  const invoice=state.invoices.find(x=>String(x.id)===String(id));
  if(!invoice)throw new Error("Invoice action read-back failed: invoice not found.");
  if(action==="markPaid"&&(invoice.paymentStatus!=="paid"||!state.entries.some(e=>String(e.invoiceId)===String(id))))throw new Error("Paid invoice and linked income were not both verified.");
  if(action==="markUnpaid"&&(invoice.paymentStatus!=="unpaid"||state.entries.some(e=>String(e.invoiceId)===String(id))))throw new Error("Unpaid invoice state or linked income removal was not verified.");
  if(action==="softDelete"&&!(invoice.deleted===true||invoice.deletedAt))throw new Error("Invoice soft-delete read-back failed.");
  return {ok:true,verified:true,state,invoice:clone(invoice)};
 }
 async function markInvoicePaid(id,payment){return invoiceAction("markPaid",id,payment);}
 async function markInvoiceUnpaid(id){return invoiceAction("markUnpaid",id);}
 async function softDeleteInvoice(id){return invoiceAction("softDelete",id);}
 root.HandymanAccountingUIOperationsV264=Object.freeze({saveEntry,deleteEntry,saveCustomer,deleteCustomer,saveInvoice,markInvoicePaid,markInvoiceUnpaid,softDeleteInvoice});
})(window);
