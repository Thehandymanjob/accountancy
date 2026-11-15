/* THA v264 Contracts controller — asynchronous IndexedDB-only.
   Preserves the existing contract record shape and unknown fields.
   No LocalStorage/SessionStorage access, import, fallback, or cleanup.
*/
(function(root){
 "use strict";
 const BUILD="THA-264-CONTRACTS-2";
 const storage=()=>{const s=root.HandymanAppStorageV264;if(!s)throw new Error("v264 application storage adapter is not loaded.");return s;};
 const clone=value=>{if(typeof root.structuredClone==="function")return root.structuredClone(value);throw new Error("This browser must support structuredClone for safe contract persistence.");};
 function normalize(value){
  if(value===null||value===undefined)value={contracts:[]};
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Contracts state must be an object.");
  const state=clone(value);
  if(!Array.isArray(state.contracts))throw new Error("Contracts collection is damaged; changes are blocked to protect saved contracts.");
  const ids=new Set();
  for(const item of state.contracts){
   if(!item||typeof item!=="object"||Array.isArray(item)||typeof item.id!=="string"||!item.id.trim())throw new Error("A saved contract has an invalid stable ID; changes are blocked.");
   if(ids.has(item.id))throw new Error("Duplicate contract ID detected; changes are blocked.");
   ids.add(item.id);
  }
  return state;
 }
 async function initialize(){await storage().initialize();return normalize(await storage().read("contracts"));}
 async function load(){return initialize();}
 async function save(value){
  const next=normalize(value);
  const result=await storage().write("contracts",next);
  if(!result||result.ok!==true)throw new Error("Contracts state write was not confirmed.");
  const verified=normalize(await storage().read("contracts"));
  if(!root.HandymanStorageV264||typeof root.HandymanStorageV264.valuesEqual!=="function"||!(await root.HandymanStorageV264.valuesEqual(verified,next)))throw new Error("Contracts state full-content verification failed after save.");
  return {ok:true,state:verified};
 }
 async function update(mutator){
  if(typeof mutator!=="function")throw new Error("A synchronous Contracts updater is required.");
  const result=await storage().mutate("contracts",current=>{
   const state=normalize(current),next=mutator(state);
   if(next&&typeof next.then==="function")throw new Error("Contracts updater must be synchronous.");
   return normalize(next===undefined?state:next);
  });
  if(!result||result.ok!==true)throw new Error("Atomic Contracts update was not confirmed.");
  return {ok:true,state:normalize(result.state)};
 }
 async function add(contract){
  if(!contract||typeof contract!=="object"||Array.isArray(contract)||typeof contract.id!=="string"||!contract.id.trim())throw new Error("A contract with a stable string ID is required.");
  return update(s=>{if(s.contracts.some(c=>c.id===contract.id))throw new Error("Contract ID already exists.");s.contracts.unshift(clone(contract));return s;});
 }
 async function updateContract(id,changes){
  if(!id||!changes||typeof changes!=="object"||Array.isArray(changes))throw new Error("A contract ID and changes object are required.");
  return update(s=>{const i=s.contracts.findIndex(c=>c.id===String(id));if(i<0)throw new Error("Contract not found.");s.contracts[i]={...s.contracts[i],...clone(changes),id:s.contracts[i].id};return s;});
 }
 async function remove(id){
  if(!id)throw new Error("A contract ID is required.");
  return update(s=>{const before=s.contracts.length;s.contracts=s.contracts.filter(c=>c.id!==String(id));if(s.contracts.length===before)throw new Error("Contract not found.");return s;});
 }
 async function get(id){const state=await load();return state.contracts.find(c=>c.id===String(id))||null;}
 root.HandymanContractsV264=Object.freeze({build:BUILD,initialize,load,save,update,add,updateContract,remove,get});
})(window);
