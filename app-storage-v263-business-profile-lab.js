/* Isolated adapter for the THA v263 Business Profile lab only. */
(function(root){
 "use strict";
 const engine=()=>{if(!root.HandymanStorageV263)throw new Error("Business Profile IndexedDB engine is not loaded.");return root.HandymanStorageV263;};
 async function initialize(){const r=await engine().ready();if(!r||r.ok!==true)throw new Error("Business Profile database initialization failed.");return {ok:true,database:r.database,mode:"business-profile-only",projectsDomain:false,accountingDomain:false};}
 async function read(name){if(name!=="businessProfile")throw new Error("Business Profile adapter rejects non-profile domains.");await initialize();const value=await engine().get("business_profile","identity");return value===null?{businessName:"",ownerName:"",phone:"",email:"",address:"",logo:"",paymentDetails:""}:value;}
 async function write(name,value){if(name!=="businessProfile")throw new Error("Business Profile adapter rejects non-profile domains.");await initialize();return engine().put("business_profile","identity",value);}
 async function health(){await initialize();return engine().health();}
 root.HandymanAppStorageV263=Object.freeze({domains:["businessProfile"],initialize,read,write,health});
})(window);
