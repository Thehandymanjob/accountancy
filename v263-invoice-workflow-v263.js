/* THA v263 canonical invoice workflow — IndexedDB-only, one Accounting-domain mutation per action.
   Supports the existing UI's binary full-payment model; partial payments are deliberately rejected.
*/
(function(root){
 "use strict";
 const api=()=>{const x=root.HandymanAccountingV263;if(!x)throw new Error("Accounting controller is not loaded.");return x;};
 const clone=x=>root.structuredClone(x),round=n=>Math.round((Number(n)||0)*100)/100;
 function total(i){
  let subtotal=Array.isArray(i.items)&&i.items.length?i.items.reduce((n,x)=>n+(Number(x.price)||0),0):(Number(i.qty)||0)*(Number(i.unitPrice)||0);
  subtotal=round(subtotal);
  const rate=i.vat==="none"?0:Number(i.vat)||0;
  return round(subtotal+Math.round(subtotal*rate)/100);
 }
 function validatePayment(p,invoice){
  if(!p||!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date||""))||!["cash","bank"].includes(p.method)||!(round(p.amount)>0))throw new Error("A valid payment date, method and positive amount are required.");
  const expected=total(invoice);
  if(round(p.amount)!==expected)throw new Error("This invoice workflow supports full payment only. Payment must equal the invoice total ("+expected+").");
 }
 function linkedIncome(e,invoice){
  if(!e||e.type!=="income")return false;
  // Never infer ownership from a human-readable invoice reference or note:
  // unrelated manual income may legitimately contain the same text.
  // Only stable invoiceId or the app-generated income ID proves the link.
  const id=String(invoice.id);
  return String(e.invoiceId||"")===id||String(e.id||"")==="invoice-income-"+id;
 }
 function removeLinkedIncome(state,invoice){
  const matches=state.entries.filter(e=>linkedIncome(e,invoice));
  state.entries=state.entries.filter(e=>!matches.includes(e));
  return matches.length;
 }
 function upsertLinkedIncome(state,invoice,payment){
  const matches=state.entries.filter(e=>linkedIncome(e,invoice));
  const prior=matches[0],entry={id:prior?.id||"invoice-income-"+invoice.id,type:"income",date:payment.date,amount:total(invoice),method:payment.method,category:"Work income",reference:"Invoice "+invoice.number,notes:"Payment received for invoice "+invoice.number,invoiceId:invoice.id,createdAt:prior?.createdAt||new Date().toISOString()};
  state.entries=state.entries.filter(e=>!matches.includes(e));
  state.entries.push(entry);
 }
 async function saveInvoice(invoice,payment,customer){
  if(!invoice||typeof invoice!=="object"||!invoice.id)throw new Error("Invoice ID is required.");
  const item=clone(invoice),newCustomer=customer&&typeof customer==="object"?clone(customer):null;
  if(!item.customerId&&newCustomer&&newCustomer.id)item.customerId=newCustomer.id;
  if(!item.customerId)throw new Error("Invoice customer ID is required.");
  if(payment&&item.status==="draft")throw new Error("Draft invoices cannot be marked paid.");
  if(!Number.isSafeInteger(Number(item.number))||Number(item.number)<1)item.number=await api().reserveInvoiceNumber();
  else await api().reserveInvoiceNumber(Number(item.number));
  await api().update(state=>{
   let customer=state.customers.find(c=>String(c.id)===String(item.customerId));
   if(!customer&&newCustomer){
    const norm=v=>String(v||"").trim().replace(/\s+/g," ").toLocaleLowerCase();
    const name=norm(newCustomer.name),phone=norm(newCustomer.phone),address=norm(newCustomer.address);
    if(name)customer=state.customers.find(c=>norm(c.name)===name&&((phone&&norm(c.phone)===phone)||(address&&norm(c.address)===address)||(!phone&&!address)))||null;
    if(customer)item.customerId=customer.id;
    else{
     if(String(newCustomer.id)!==String(item.customerId)||!name)throw new Error("Invoice customer does not exist and no valid new customer was supplied.");
     if(state.customers.some(c=>String(c.id)===String(newCustomer.id)))throw new Error("New customer ID is already in use.");
     state.customers.push(newCustomer);customer=newCustomer;
    }
   }
   if(!customer)throw new Error("Invoice customer does not exist and no valid new customer was supplied.");
   const prior=state.invoices.find(i=>String(i.id)===String(item.id));
   if(prior&&Number(prior.number)!==Number(item.number))throw new Error("An existing invoice number cannot be changed.");
   if(state.invoices.some(i=>String(i.id)!==String(item.id)&&Number(i.number)===Number(item.number)))throw new Error("Invoice number is already in use.");
   if(prior&&(prior.deletedAt||prior.deleted))throw new Error("Deleted invoices cannot be edited; restore them first.");
   if(payment){validatePayment(payment,item);item.status="issued";item.paymentStatus="paid";item.paymentDate=payment.date;item.paymentMethod=payment.method;upsertLinkedIncome(state,item,payment);}
   else{item.paymentStatus="unpaid";item.paymentDate="";item.paymentMethod="";removeLinkedIncome(state,prior||item);}
   item.createdAt=prior?.createdAt||item.createdAt||new Date().toISOString();
   item.updatedAt=new Date().toISOString();
   const index=state.invoices.findIndex(i=>String(i.id)===String(item.id));
   if(index<0)state.invoices.push(item);else state.invoices[index]=item;
   return state;
  });
  return {ok:true,id:String(item.id),number:Number(item.number),paymentStatus:item.paymentStatus};
 }
 async function markPaid(id,payment){
  await api().update(state=>{
   const invoice=state.invoices.find(i=>String(i.id)===String(id)&&!i.deletedAt&&!i.deleted);
   if(!invoice)throw new Error("Active invoice not found.");
   if(invoice.status==="draft")throw new Error("Draft invoices cannot be marked paid.");
   validatePayment(payment,invoice);
   invoice.status="issued";invoice.paymentStatus="paid";invoice.paymentDate=payment.date;invoice.paymentMethod=payment.method;invoice.updatedAt=new Date().toISOString();
   upsertLinkedIncome(state,invoice,payment);return state;
  });
  return {ok:true,id:String(id),paymentStatus:"paid"};
 }
 async function markUnpaid(id){
  await api().update(state=>{
   const invoice=state.invoices.find(i=>String(i.id)===String(id)&&!i.deletedAt&&!i.deleted);
   if(!invoice)throw new Error("Active invoice not found.");
   removeLinkedIncome(state,invoice);invoice.paymentStatus="unpaid";invoice.paymentDate="";invoice.paymentMethod="";invoice.updatedAt=new Date().toISOString();return state;
  });
  return {ok:true,id:String(id),paymentStatus:"unpaid"};
 }
 async function softDelete(id){
  await api().update(state=>{
   const invoice=state.invoices.find(i=>String(i.id)===String(id)&&!i.deletedAt&&!i.deleted);
   if(!invoice)throw new Error("Active invoice not found.");
   removeLinkedIncome(state,invoice);invoice.deletedAt=new Date().toISOString();invoice.deleted=true;invoice.paymentStatus="unpaid";invoice.paymentDate="";invoice.paymentMethod="";invoice.updatedAt=new Date().toISOString();return state;
  });
  return {ok:true,id:String(id),numberReserved:true};
 }
 root.HandymanInvoiceWorkflowV263=Object.freeze({saveInvoice,markPaid,markUnpaid,softDelete,total});
})(window);
