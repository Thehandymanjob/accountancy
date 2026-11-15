/* THA v263 strict accounting-only adapter.
   Accounting state and invoice sequence are stored under the accounting domain.
   No Projects domain/controller/API, cross-domain references, or legacy access.
*/
(function(root){
 "use strict";
 const engine=()=>{const x=root.HandymanStorageV263;if(!x)throw new Error("Accounting-only IndexedDB engine is not loaded.");return x;};
 const fallback=()=>({entries:[],customers:[],invoices:[],customExpenseCategories:[],settings:{businessName:"",ownerName:""}});
 async function initialize(){const s=await engine().ready();if(!s||s.ok!==true)throw new Error("Accounting-only database initialization failed.");return {...s,mode:"accounting-only",availableDomains:["accounting"],projectsDomain:false};}
 async function read(name){if(name!=="accounting")throw new Error("Accounting-only adapter rejects non-accounting domain: "+name);const v=await engine().get("accounting","state");return v===null?fallback():v;}
 async function write(name,value){if(name!=="accounting")throw new Error("Accounting-only adapter rejects non-accounting domain: "+name);return engine().put("accounting","state",value);}
 async function mutate(name,updater){if(name!=="accounting")throw new Error("Accounting-only adapter rejects non-accounting domain: "+name);if(typeof updater!=="function")throw new Error("A synchronous accounting updater is required.");const r=await engine().mutateMany([{domain:"accounting",key:"state",initialValue:fallback()}],rows=>{const next=updater(rows[0].value);if(next&&typeof next.then==="function")throw new Error("Accounting updater must be synchronous.");return [next===undefined?rows[0].value:next];});return {ok:true,state:r.records[0].value,updatedAt:r.updatedAt};}
 async function reserveInvoiceNumber(minimum){return engine().reserveCounter("accounting","invoice-number",minimum||0);}
 async function backup(){return engine().snapshot(["accounting"]);}
 async function restore(pkg){if(!pkg||pkg.database!=="tha_v263_accounting_only_lab_20261109_idb"||!Array.isArray(pkg.domains)||pkg.domains.length!==1||pkg.domains[0]!=="accounting")throw new Error("Accounting-only restore accepts only an accounting-domain backup.");return engine().restore(pkg);}
 async function health(){const h=await engine().health();return {...h,availableDomains:["accounting"],projectsDomain:false};}
 root.HandymanAppStorageV263=Object.freeze({domains:Object.freeze(["accounting"]),initialize,read,write,mutate,reserveInvoiceNumber,backup,restore,health});
})(window);
