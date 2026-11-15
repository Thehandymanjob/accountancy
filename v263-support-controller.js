/* THA v263 support-domain controller.
   Async IndexedDB-only access for preferences, diagnostics, report workspace,
   notifications and recovery metadata. This module is not wired into index.html.
*/
(function(root){
  "use strict";
  const BUILD="THA-263-SUPPORT-1";
  const adapter=()=>{const value=root.HandymanAppStorageV263;if(!value)throw new Error("v263 application storage adapter is not loaded.");return value;};
  const supported=Object.freeze(["preferences","preferenceMeta","diagnostics","reports","reportNotifications","reportSettings","reportWorkflow","notifications","recovery","factoryResetRecovery"]);
  function assertDomain(name){if(!supported.includes(name))throw new Error("Unsupported v263 support domain: "+name);return name;}
  async function initialize(){const result=await adapter().initialize();if(!result||result.ok!==true)throw new Error("v263 support storage initialization failed.");return {ok:true,build:BUILD,domains:supported.slice()};}
  async function load(name){assertDomain(name);await adapter().initialize();return adapter().read(name);}
  async function save(name,value){assertDomain(name);await adapter().initialize();const result=await adapter().write(name,value);if(!result||result.ok!==true)throw new Error("v263 support-domain write was not confirmed: "+name);const check=await adapter().read(name);const engine=root.HandymanStorageV263;if(!engine||typeof engine.valuesEqual!=="function"||!(await engine.valuesEqual(check,value)))throw new Error("v263 support-domain full-content verification failed: "+name);return {ok:true,domain:name,value:check};}
  async function update(name,mutator){assertDomain(name);if(typeof mutator!=="function")throw new Error("A synchronous support-domain updater is required.");await adapter().initialize();const result=await adapter().mutate(name,current=>{const next=mutator(current);if(next&&typeof next.then==="function")throw new Error("Support-domain updater must be synchronous.");return next===undefined?current:next;});if(!result||result.ok!==true)throw new Error("Atomic support-domain update was not confirmed: "+name);return {ok:true,domain:name,value:result.state};}
  async function appendDiagnostic(event){if(!event||typeof event!=="object"||Array.isArray(event))throw new Error("A diagnostic event object is required.");return update("diagnostics",items=>{const list=Array.isArray(items)?items:[];list.push(event);return list.slice(-2500);});}
  async function saveAndVerify(name,value){
    const result=await adapter().write(name,value);
    if(!result||result.ok!==true)throw new Error("Support-domain write was not confirmed: "+name);
    const verified=await adapter().read(name),engine=root.HandymanStorageV263;
    if(!engine||typeof engine.valuesEqual!=="function"||!(await engine.valuesEqual(verified,value)))throw new Error("Support-domain verification failed: "+name);
    return verified;
  }
  async function setLanguage(language,preferenceVersion){
    if(typeof language!=="string"||!language.trim())throw new Error("A language code is required.");
    await adapter().initialize();
    const savedLanguage=await saveAndVerify("preferences",language);
    let savedVersion=null;
    if(preferenceVersion!==undefined)savedVersion=await saveAndVerify("preferenceMeta",String(preferenceVersion));
    return {ok:true,language:savedLanguage,preferenceVersion:savedVersion};
  }
  async function saveReportWorkspace(value){
    if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("A report workspace object is required.");
    await adapter().initialize();
    const values=[
      ["reports",value.archive===undefined?[]:value.archive],
      ["reportNotifications",value.notifications===undefined?[]:value.notifications],
      ["reportSettings",value.settings===undefined?{}:value.settings],
      ["reportWorkflow",value.workflow===undefined?{}:value.workflow]
    ];
    const verified={};
    for(const [name,next] of values)verified[name]=await saveAndVerify(name,next);
    return {ok:true,archive:verified.reports,notifications:verified.reportNotifications,settings:verified.reportSettings,workflow:verified.reportWorkflow};
  }
  async function loadReportWorkspace(){const names=["reports","reportNotifications","reportSettings","reportWorkflow"];const values=await Promise.all(names.map(load));return {archive:values[0],notifications:values[1],settings:values[2],workflow:values[3]};}
  root.HandymanSupportV263=Object.freeze({build:BUILD,domains:supported,initialize,load,save,update,appendDiagnostic,setLanguage,loadReportWorkspace,saveReportWorkspace});
})(window);
