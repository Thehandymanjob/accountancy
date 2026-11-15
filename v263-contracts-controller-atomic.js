/* THA v263 atomic Contracts domain controller — isolated integration lab. */
(function(root){
 "use strict";
 const storage=()=>{const api=root.HandymanAppStorageV263;if(!api)throw new Error("v263 application storage is unavailable.");return api;};
 const clone=value=>root.structuredClone(value);
 function normalize(value){if(!value||typeof value!=="object"||Array.isArray(value)||!Array.isArray(value.contracts))throw new Error("Contracts state has an invalid structure.");const ids=new Set();for(const c of value.contracts){if(!c||typeof c!=="object"||!c.id)throw new Error("Every contract requires a stable ID.");if(ids.has(String(c.id)))throw new Error("Duplicate contract ID: "+c.id);ids.add(String(c.id));}return {...value,contracts:value.contracts};}
 async function load(){return normalize(await storage().read("contracts"));}
 async function update(mutator){if(typeof mutator!=="function")throw new Error("A synchronous Contracts updater is required.");const result=await storage().mutate("contracts",current=>{const state=normalize(current),next=mutator(state);if(next&&typeof next.then==="function")throw new Error("Contracts updater must be synchronous.");return normalize(next===undefined?state:next);});if(!result||result.ok!==true)throw new Error("Atomic Contracts update was not confirmed.");return {ok:true,state:normalize(result.state)};}
 async function save(contract){if(!contract||typeof contract!=="object"||!contract.id)throw new Error("A contract with a stable ID is required.");return update(state=>{const i=state.contracts.findIndex(x=>String(x.id)===String(contract.id));if(i<0)state.contracts.push(clone(contract));else state.contracts[i]=clone(contract);return state;});}
 async function remove(id){return update(state=>{const before=state.contracts.length;state.contracts=state.contracts.filter(x=>String(x.id)!==String(id));if(before===state.contracts.length)throw new Error("Contract not found.");return state;});}
 root.HandymanContractsV263=Object.freeze({load,update,save,remove});
})(window);
