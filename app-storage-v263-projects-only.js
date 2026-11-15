/* THA v263 projects-only storage adapter.
   Exposes ONLY the projects domain. No accounting domain, cross-domain API,
   import, transfer, or legacy-storage access exists in this adapter.
*/
(function(root){
 "use strict";
 const engine=()=>{const x=root.HandymanStorageV263;if(!x)throw new Error("Projects-only IndexedDB engine is not loaded.");return x;};
 const fallback=()=>({projects:[],workers:[],partners:[],contractors:[],companies:[],companyJobs:[],profile:{},current:null,guide:"en"});
 async function initialize(){const s=await engine().ready();if(!s||s.ok!==true)throw new Error("Projects-only database initialization failed.");return {...s,mode:"projects-only",availableDomains:["projects"],accountingDomain:false};}
 async function read(name){if(name!=="projects")throw new Error("Projects-only adapter rejects non-project domain: "+name);const value=await engine().get("projects","state");return value===null?fallback():value;}
 async function write(name,value){if(name!=="projects")throw new Error("Projects-only adapter rejects non-project domain: "+name);return engine().put("projects","state",value);}
 async function mutate(name,updater){if(name!=="projects")throw new Error("Projects-only adapter rejects non-project domain: "+name);if(typeof updater!=="function")throw new Error("A synchronous project updater is required.");const result=await engine().mutateMany([{domain:"projects",key:"state",initialValue:fallback()}],rows=>{const next=updater(rows[0].value);if(next&&typeof next.then==="function")throw new Error("Project updater must be synchronous.");return [next===undefined?rows[0].value:next];});return {ok:true,state:result.records[0].value,updatedAt:result.updatedAt};}
 async function backup(){return engine().snapshot(["projects"]);}
 async function restore(pkg){if(!pkg||pkg.database!=="tha_v263_projects_only_lab_20261109_idb"||!Array.isArray(pkg.domains)||pkg.domains.length!==1||pkg.domains[0]!=="projects")throw new Error("Projects-only restore accepts only a projects-domain backup.");return engine().restore(pkg);}
 async function health(){const h=await engine().health();return {...h,availableDomains:["projects"],accountingDomain:false};}
 root.HandymanAppStorageV263=Object.freeze({domains:Object.freeze(["projects"]),initialize,read,write,mutate,backup,restore,health});
})(window);