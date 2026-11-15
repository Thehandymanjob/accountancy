/* THA v263 isolated application bootstrap — LAB 1.
   Read-only startup composition for the v263 domain controllers.
   No LocalStorage import, no writes, no production app wiring.
*/
(function(root){
 "use strict";
 const BUILD="THA-263-APP-SHELL-BOOTSTRAP-1";
 const required=[
  ["storage",()=>root.HandymanAppStorageV263],
  ["accounting",()=>root.HandymanAccountingV263],
  ["projects",()=>root.HandymanProjectsV263],
  ["contracts",()=>root.HandymanContractsV263],
  ["support",()=>root.HandymanSupportV263],
  ["recovery",()=>root.HandymanRecoveryV263]
 ];
 async function start(){
  const missing=required.filter(([,get])=>!get()).map(([name])=>name);
  if(missing.length)throw new Error("Startup blocked; missing v263 modules: "+missing.join(", "));
  const storage=root.HandymanAppStorageV263;
  const initialized=await storage.initialize();
  if(!initialized||initialized.ok!==true||initialized.mode!=="indexeddb-only")throw new Error("Startup blocked; IndexedDB-only storage did not initialize.");
  const [accounting,projects,contracts,support]=await Promise.all([
   root.HandymanAccountingV263.initialize(),
   root.HandymanProjectsV263.initialize(),
   root.HandymanContractsV263.initialize(),
   root.HandymanSupportV263.initialize()
  ]);
  const supportNames=root.HandymanSupportV263.domains;
  const supportValues={};
  for(const name of supportNames)supportValues[name]=await root.HandymanSupportV263.load(name);
  const health=await storage.health();
  if(!health||health.ok!==true)throw new Error("Startup blocked; IndexedDB health check did not pass.");
  const recovery=root.HandymanRecoveryV263.create();
  if(!recovery||typeof recovery.createBackup!=="function"||typeof recovery.inspectFile!=="function"||typeof recovery.restoreFromFile!=="function"||typeof recovery.resetFromBackupFile!=="function")throw new Error("Startup blocked; recovery API is incomplete.");
  const counts={
   entries:accounting.entries.length,customers:accounting.customers.length,invoices:accounting.invoices.length,
   projects:projects.projects.length,workers:projects.workers.length,partners:projects.partners.length,
   contractors:projects.contractors.length,companies:projects.companies.length,companyJobs:projects.companyJobs.length,
   contracts:contracts.contracts.length,reports:Array.isArray(supportValues.reports)?supportValues.reports.length:0,
   diagnostics:Array.isArray(supportValues.diagnostics)?supportValues.diagnostics.length:0
  };
  return Object.freeze({
   ok:true,build:BUILD,mode:"indexeddb-only",legacyImport:false,database:initialized.database,
   storageBuild:initialized.build,health,counts,supportDomains:supportNames.slice(),
   recoveryReady:true,readOnlyBootstrap:true
  });
 }
 root.HandymanAppBootstrapV263=Object.freeze({build:BUILD,start});
})(window);
