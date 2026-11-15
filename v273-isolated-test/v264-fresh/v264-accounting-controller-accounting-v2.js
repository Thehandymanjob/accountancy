/* THA v264 asynchronous accounting domain controller.
   All accounting state is read/written through the v264 IndexedDB adapter.
   No legacy storage reads, imports, fallbacks, or cleanup are performed.
*/
(function(root){
 "use strict";
 const storage=()=>{const api=root.HandymanAppStorageV264;if(!api)throw new Error("v264 application storage adapter is unavailable.");return api;};
 const clone=value=>root.structuredClone(value);
 const validState=value=>value&&typeof value==="object"&&!Array.isArray(value)&&
   Array.isArray(value.entries)&&Array.isArray(value.customers)&&Array.isArray(value.invoices);
 function normalize(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Accounting state has an invalid structure.");
  const defaults={entries:[],customers:[],invoices:[],customExpenseCategories:[],settings:{businessName:"",ownerName:""}};
  const state={...defaults,...value};
  if(!Array.isArray(state.entries)||!Array.isArray(state.customers)||!Array.isArray(state.invoices))
   throw new Error("Accounting state is missing a required record collection.");
  if(!Array.isArray(state.customExpenseCategories))state.customExpenseCategories=[];
  if(!state.settings||typeof state.settings!=="object"||Array.isArray(state.settings))state.settings={};
  state.settings={businessName:"",ownerName:"",...state.settings};
  return state;
 }
 async function firstDifference(a,b,path="$",seen=new WeakMap()){
  if(Object.is(a,b))return null;
  if(a===null||b===null||typeof a!=="object"||typeof b!=="object")return path+" primitive/value mismatch ("+typeof a+" vs "+typeof b+")";
  let paired=seen.get(a);if(paired&&paired.has(b))return null;if(!paired){paired=new WeakSet();seen.set(a,paired);}paired.add(b);
  if(a instanceof Blob||b instanceof Blob){
   if(!(a instanceof Blob)||!(b instanceof Blob))return path+" Blob type mismatch";
   if(a.size!==b.size||a.type!==b.type)return path+" Blob metadata mismatch ("+a.size+"/"+a.type+" vs "+b.size+"/"+b.type+")";
   if(typeof File!=="undefined"&&(a instanceof File||b instanceof File)&&(!(a instanceof File)||!(b instanceof File)||a.name!==b.name||a.lastModified!==b.lastModified))return path+" File metadata/type mismatch ("+(a.constructor&&a.constructor.name)+"/"+(a.name||"")+" vs "+(b.constructor&&b.constructor.name)+"/"+(b.name||"")+")";
   const [x,y]=await Promise.all([a.arrayBuffer(),b.arrayBuffer()]);const X=new Uint8Array(x),Y=new Uint8Array(y);if(X.length!==Y.length)return path+" Blob byte-length mismatch";for(let i=0;i<X.length;i++)if(X[i]!==Y[i])return path+" Blob byte mismatch at "+i;return null;
  }
  if(a instanceof Date||b instanceof Date)return a instanceof Date&&b instanceof Date&&a.getTime()===b.getTime()?null:path+" Date mismatch";
  if(Array.isArray(a)||Array.isArray(b)){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return path+" array shape mismatch";for(let i=0;i<a.length;i++){const d=await firstDifference(a[i],b[i],path+"["+i+"]",seen);if(d)return d;}return null;}
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();if(ak.length!==bk.length||ak.some((k,i)=>k!==bk[i]))return path+" object keys mismatch ("+ak.join(",")+" vs "+bk.join(",")+")";
  for(const k of ak){const d=await firstDifference(a[k],b[k],path+"."+k,seen);if(d)return d;}return null;
 }
 async function initialize(){await storage().initialize();return load();}
 async function load(){return normalize(await storage().read("accounting"));}
 async function save(value){
  const state=normalize(clone(value));
  const result=await storage().write("accounting",state);
  if(!result||result.ok!==true)throw new Error("Accounting state write was not confirmed.");
  const verified=normalize(await storage().read("accounting"));
  if(!root.HandymanStorageV264||typeof root.HandymanStorageV264.valuesEqual!=="function")throw new Error("Accounting verification engine is unavailable.");if(!(await root.HandymanStorageV264.valuesEqual(verified,state))){const difference=await firstDifference(verified,state);throw new Error("Accounting full-content verification failed after save: "+(difference||"comparator mismatch without a located field difference"));}
  return {ok:true,state:verified};
 }
 async function update(mutator){
  if(typeof mutator!=="function")throw new Error("A synchronous accounting updater is required.");
  const result=await storage().mutate("accounting",current=>{
   const state=normalize(current);
   const next=mutator(state);
   if(next&&typeof next.then==="function")throw new Error("Accounting updater must be synchronous.");
   return normalize(next===undefined?state:next);
  });
  if(!result||result.ok!==true||!validState(result.state))throw new Error("Atomic accounting update was not confirmed.");
  return {ok:true,state:normalize(result.state)};
 }
 async function addEntry(entry){
  if(!entry||typeof entry!=="object"||!entry.id)throw new Error("An entry with a stable ID is required.");
  return update(state=>{if(state.entries.some(x=>String(x.id)===String(entry.id)))throw new Error("An entry with this ID already exists.");state.entries.push(clone(entry));return state;});
 }
 async function updateEntry(id,changes){
  return update(state=>{const i=state.entries.findIndex(x=>String(x.id)===String(id));if(i<0)throw new Error("Entry not found.");state.entries[i]={...state.entries[i],...clone(changes),id:state.entries[i].id};return state;});
 }
 async function deleteEntry(id){
  return update(state=>{const entry=state.entries.find(x=>String(x.id)===String(id));if(!entry)throw new Error("Entry not found.");if(entry.invoiceId)throw new Error("Invoice-linked income must be changed through the invoice payment workflow.");state.entries=state.entries.filter(x=>String(x.id)!==String(id));return state;});
 }
 async function saveCustomer(customer){
  if(!customer||typeof customer!=="object"||!customer.id||!String(customer.name||"").trim())throw new Error("A customer ID and name are required.");
  return update(state=>{const i=state.customers.findIndex(x=>String(x.id)===String(customer.id));if(i<0)state.customers.push(clone(customer));else state.customers[i]=clone(customer);return state;});
 }
 async function deleteCustomer(id){
  return update(state=>{if(state.invoices.some(x=>String(x.customerId)===String(id)))throw new Error("Customers linked to invoices cannot be deleted.");state.customers=state.customers.filter(x=>String(x.id)!==String(id));return state;});
 }
 async function reserveInvoiceNumber(minimum){const result=await storage().reserveInvoiceNumber(Number(minimum)||0);if(!result||result.ok!==true||!Number.isInteger(result.value)||result.value<1)throw new Error("Invoice number reservation was not confirmed.");return result.value;}
 root.HandymanAccountingV264=Object.freeze({initialize,load,save,update,addEntry,updateEntry,deleteEntry,saveCustomer,deleteCustomer,reserveInvoiceNumber});
})(window);
