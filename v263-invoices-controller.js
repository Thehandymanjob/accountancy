/* THA v263 Invoice controller — IndexedDB-only; invoice + linked income are atomic within accounting state. */
(function(root){
 "use strict";
 const storage=()=>{const s=root.HandymanAppStorageV263;if(!s)throw new Error("v263 storage adapter unavailable.");return s;};
 const clone=v=>root.structuredClone(v);
 const money=v=>Math.round((Number(v)||0)*100)/100;
 function normalize(v){if(!v||typeof v!=="object"||Array.isArray(v)||!Array.isArray(v.invoices)||!Array.isArray(v.entries)||!Array.isArray(v.customers))throw new Error("Accounting state structure invalid.");return v;}
 function total(i){let sub=Array.isArray(i.items)&&i.items.length?i.items.reduce((n,x)=>n+(Number(x.price)||0),0):(Number(i.qty)||0)*(Number(i.unitPrice)||0);sub=money(sub);const rate=i.vat==="none"?0:Number(i.vat)||0;return money(sub+Math.round(sub*rate)/100);}
 async function mutate(fn){const r=await storage().mutate("accounting",current=>{const s=normalize(current);const next=fn(s);if(next&&typeof next.then==="function")throw new Error("Updater must be synchronous.");return normalize(next||s);});if(!r||r.ok!==true)throw new Error("Atomic accounting mutation failed.");return {ok:true,state:normalize(r.state)};}
 async function load(){return normalize(await storage().read("accounting"));}
 async function create(input){
  if(!input||!input.customerId||!input.date||!Array.isArray(input.items)||!input.items.length)throw new Error("Customer, date and at least one invoice item are required.");
  const id=String(input.id||("v263-invoice-"+Date.now()));
  let number=Number(input.number);
  if(!Number.isSafeInteger(number)||number<1)number=await storage().reserveInvoiceNumber(0).then(x=>x.value);
  const invoice={...clone(input),id,number,status:input.status==="draft"?"draft":"issued",paymentStatus:"unpaid",createdAt:input.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  await mutate(s=>{if(!s.customers.some(c=>String(c.id)===String(invoice.customerId)))throw new Error("Invoice customer does not exist.");if(s.invoices.some(x=>Number(x.number)===number))throw new Error("Invoice number already exists.");if(s.entries.some(e=>e.type==="income"&&Number(e.number)===number))throw new Error("Invoice number is already used by an income record.");s.invoices.push(invoice);return s;});
  return {ok:true,invoice:(await load()).invoices.find(x=>x.id===id)};
 }
 async function update(id,changes){
  if(!id||!changes||typeof changes!=="object"||Array.isArray(changes))throw new Error("Invoice ID and changes are required.");
  await mutate(s=>{const i=s.invoices.find(x=>String(x.id)===String(id));if(!i||i.deletedAt||i.deleted===true)throw new Error("Invoice not found.");if(i.paymentStatus==="paid"&&("items" in changes||"vat" in changes||"qty" in changes||"unitPrice" in changes))throw new Error("Paid invoice financial lines are locked; reverse payment first.");const number=Number(changes.number??i.number);if(!Number.isSafeInteger(number)||number<1)throw new Error("Invalid invoice number.");if(s.invoices.some(x=>x.id!==i.id&&Number(x.number)===number)||s.entries.some(e=>e.type==="income"&&Number(e.number)===number&&String(e.invoiceId||"")!==String(i.id)))throw new Error("Invoice number already in use.");Object.assign(i,clone(changes),{id:i.id,number,updatedAt:new Date().toISOString()});return s;});
  return {ok:true,invoice:(await load()).invoices.find(x=>String(x.id)===String(id))};
 }
 async function recordPayment(id,date,method){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date))||!["bank","cash"].includes(method))throw new Error("Valid payment date and method (bank/cash) required.");
  await mutate(s=>{const i=s.invoices.find(x=>String(x.id)===String(id));if(!i||i.deletedAt||i.deleted===true)throw new Error("Invoice not found.");if(i.status==="draft")throw new Error("Draft invoices cannot be marked paid.");const amount=total(i);if(!(amount>0))throw new Error("Invoice total must be greater than zero.");const matches=s.entries.filter(e=>e.type==="income"&&(String(e.invoiceId||"")===String(i.id)||String(e.id||"")==="invoice-income-"+i.id||String(e.reference||"").trim()==="Invoice "+String(i.number)));if(matches.length>1)throw new Error("Multiple linked income entries found; payment is blocked to prevent duplicates.");const entry={...(matches[0]||{}),id:matches[0]?.id||"invoice-income-"+i.id,type:"income",date,amount,method,category:"Work income",reference:"Invoice "+i.number,notes:"Payment received for invoice "+i.number,invoiceId:i.id,createdAt:matches[0]?.createdAt||new Date().toISOString()};s.entries=s.entries.filter(e=>!matches.some(m=>String(m.id)===String(e.id)));s.entries.push(entry);i.status="issued";i.paymentStatus="paid";i.paymentDate=date;i.paymentMethod=method;i.updatedAt=new Date().toISOString();return s;});
  const s=await load();return {ok:true,invoice:s.invoices.find(x=>String(x.id)===String(id)),linkedIncome:s.entries.find(e=>String(e.invoiceId)===String(id))};
 }
 async function markUnpaid(id){
  await mutate(s=>{const i=s.invoices.find(x=>String(x.id)===String(id));if(!i||i.deletedAt||i.deleted===true)throw new Error("Invoice not found.");s.entries=s.entries.filter(e=>!(e.type==="income"&&(String(e.invoiceId||"")===String(i.id)||String(e.id||"")==="invoice-income-"+i.id||String(e.reference||"").trim()==="Invoice "+String(i.number))));i.paymentStatus="unpaid";i.paymentDate="";i.paymentMethod="";i.updatedAt=new Date().toISOString();return s;});
  return {ok:true,invoice:(await load()).invoices.find(x=>String(x.id)===String(id))};
 }
 async function softDelete(id){
  await mutate(s=>{const i=s.invoices.find(x=>String(x.id)===String(id));if(!i||i.deletedAt||i.deleted===true)throw new Error("Invoice not found.");s.entries=s.entries.filter(e=>!(e.type==="income"&&(String(e.invoiceId||"")===String(i.id)||String(e.id||"")==="invoice-income-"+i.id||String(e.reference||"").trim()==="Invoice "+String(i.number))));i.deleted=true;i.deletedAt=new Date().toISOString();i.paymentStatus="unpaid";i.paymentDate="";i.paymentMethod="";return s;});
  return {ok:true,invoice:(await load()).invoices.find(x=>String(x.id)===String(id))};
 }
 root.HandymanInvoicesV263=Object.freeze({load,create,update,recordPayment,markUnpaid,softDelete,total});
})(window);
