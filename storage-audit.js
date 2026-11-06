/* Read-only LocalStorage / IndexedDB inventory for The Handyman Accountancy.
   This diagnostic never writes, deletes, migrates, or exports stored values. */
(function(){
  'use strict';
  const VERSION='1.0.0';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeSummary(raw){
    let value;
    try{value=JSON.parse(raw)}catch(e){return {jsonValid:false,rawType:'string',characters:raw.length};}
    const out={jsonValid:true,type:Array.isArray(value)?'array':value===null?'null':typeof value};
    if(Array.isArray(value)){out.count=value.length;out.itemTypes=[...new Set(value.slice(0,100).map(x=>Array.isArray(x)?'array':x===null?'null':typeof x))];}
    else if(value&&typeof value==='object'){
      const keys=Object.keys(value);
      out.topLevelKeys=keys;
      out.arrayCounts={};
      for(const k of keys) if(Array.isArray(value[k])) out.arrayCounts[k]=value[k].length;
      out.objectKeys={};
      for(const k of keys) if(value[k]&&typeof value[k]==='object'&&!Array.isArray(value[k])) out.objectKeys[k]=Object.keys(value[k]);
    }
    return out;
  }
  async function run(){
    const report={
      diagnostic:'The Handyman Accountancy read-only storage inventory',
      diagnosticVersion:VERSION,
      generatedAt:new Date().toISOString(),
      readOnly:true,
      writesPerformed:false,
      valuesExported:false,
      appVersion:document.querySelector('meta[name="app-version"]')?.content||'unknown',
      origin:location.origin,
      userAgent:navigator.userAgent,
      localStorage:{available:false,keyCount:0,totalApproxBytes:0,items:[]},
      indexedDB:{available:!!window.indexedDB,databaseEnumerationSupported:typeof indexedDB?.databases==='function',databases:[]},
      storageEstimate:null,
      warnings:[]
    };
    try{
      const ls=window.localStorage;
      report.localStorage.available=true;
      report.localStorage.keyCount=ls.length;
      for(let i=0;i<ls.length;i++){
        const key=ls.key(i);
        if(key===null)continue;
        const raw=ls.getItem(key);
        const bytes=raw===null?0:new Blob([key,raw]).size;
        report.localStorage.totalApproxBytes+=bytes;
        report.localStorage.items.push({key,approxBytes:bytes,valueSummary:safeSummary(raw||'')});
      }
      report.localStorage.items.sort((a,b)=>a.key.localeCompare(b.key));
    }catch(e){report.warnings.push('LocalStorage inventory failed: '+String(e&&e.message||e));}
    try{
      if(navigator.storage&&navigator.storage.estimate){
        const q=await navigator.storage.estimate();
        report.storageEstimate={usageBytes:q.usage??null,quotaBytes:q.quota??null};
      }
    }catch(e){report.warnings.push('Storage estimate unavailable: '+String(e&&e.message||e));}
    try{
      if(typeof indexedDB?.databases==='function'){
        const dbs=await indexedDB.databases();
        report.indexedDB.databases=(dbs||[]).map(d=>({name:d.name||'',version:d.version??null}));
      }else{
        report.warnings.push('This browser does not expose indexedDB.databases(); database names were not enumerated to avoid opening or creating a database.');
      }
    }catch(e){report.warnings.push('IndexedDB database enumeration failed: '+String(e&&e.message||e));}
    return report;
  }
  function install(){
    const settings=document.getElementById('settings');
    if(!settings||document.getElementById('thaStorageAuditCard'))return;
    const card=document.createElement('div');
    card.id='thaStorageAuditCard';
    card.className='pr-card';
    card.innerHTML='<h3>Read-only Storage Inventory</h3><p class="small">Lists LocalStorage key names, approximate sizes and data shapes, plus IndexedDB database names where supported. It does not display personal values and does not change any saved data.</p><div class="actions"><button type="button" class="primary" id="thaStorageAuditRun">Run Read-only Inventory</button><button type="button" id="thaStorageAuditCopy" disabled>Copy Diagnostic Report</button></div><p id="thaStorageAuditStatus" class="small" aria-live="polite">No scan has been run.</p><pre id="thaStorageAuditOutput" style="display:none;white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;background:#f2f5f9;padding:12px;border-radius:9px;font-size:11px"></pre>';
    settings.appendChild(card);
    const runButton=card.querySelector('#thaStorageAuditRun');
    const copyButton=card.querySelector('#thaStorageAuditCopy');
    const status=card.querySelector('#thaStorageAuditStatus');
    const output=card.querySelector('#thaStorageAuditOutput');
    let lastReport=null;
    runButton.addEventListener('click',async()=>{
      runButton.disabled=true;copyButton.disabled=true;status.textContent='Scanning storage in read-only mode…';
      try{
        lastReport=await run();
        output.textContent=JSON.stringify(lastReport,null,2);
        output.style.display='block';copyButton.disabled=false;
        status.textContent='Scan complete. No values were exported and no storage was changed. Review the report, then copy it.';
      }catch(e){status.textContent='Scan failed: '+String(e&&e.message||e);}
      finally{runButton.disabled=false;}
    });
    copyButton.addEventListener('click',async()=>{
      if(!lastReport)return;
      try{await navigator.clipboard.writeText(JSON.stringify(lastReport,null,2));status.textContent='Diagnostic report copied. Paste it into the ChatGPT conversation.';}
      catch(e){status.textContent='Clipboard access was blocked. Select and copy the report shown below.';}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
