/* The Handyman Accountancy - channel-based manual updater. */
(function(){
'use strict';
const meta=n=>document.querySelector('meta[name="'+n+'"]')?.content||'';
const LOCAL_VERSION=meta('app-version'),LOCAL_BUILD=meta('app-build-id');
const base=new URL('.',document.baseURI),POINTER='tha-active-pointer-v1',pointerUrl=new URL('__tha_active_cache__',base).toString(),rollbackUrl=new URL('__tha_pending_activation__',base).toString();
const CHANNEL_URL='https://raw.githubusercontent.com/Thehandymanjob/accountancy/update-channel-test/update-channel.json';
const RAW_ROOT='https://raw.githubusercontent.com/Thehandymanjob/accountancy/';
let latest=null,staged=null,busy=false;
const el=id=>document.getElementById(id);
function compare(a,b){const x=String(a||'').split(/[.+-]/).map(v=>/^\d+$/.test(v)?+v:v),y=String(b||'').split(/[.+-]/).map(v=>/^\d+$/.test(v)?+v:v);for(let i=0;i<Math.max(x.length,y.length);i++){let p=x[i]??0,q=y[i]??0;if(p===q)continue;return p>q?1:-1;}return 0;}
function status(t){if(el('appUpdateStatus'))el('appUpdateStatus').textContent=t;}
function button(on,t){const b=el('appReloadUpdate');if(!b)return;b.disabled=!on;b.setAttribute('aria-disabled',String(!on));b.textContent=t||'Update Now';b.style.opacity=on?'1':'.55';}
function progress(n,t,show=true){if(el('appUpdateProgressWrap'))el('appUpdateProgressWrap').style.display=show?'block':'none';if(el('appUpdateProgress'))el('appUpdateProgress').value=n;if(el('appUpdateProgressPercent'))el('appUpdateProgressPercent').textContent=Math.round(n)+'%';if(el('appUpdateProgressLabel'))el('appUpdateProgressLabel').textContent=t||'';}
async function hash(buf){const d=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function bytes(url,cb){const r=await fetch(url,{cache:'no-store',credentials:'omit',mode:'cors'});if(!r.ok)throw Error('HTTP '+r.status+' downloading '+new URL(url).pathname);const total=+(r.headers.get('content-length')||0);if(!r.body){const b=await r.arrayBuffer();cb(b.byteLength,total);return b;}const rd=r.body.getReader(),parts=[];let size=0;while(true){const q=await rd.read();if(q.done)break;parts.push(q.value);size+=q.value.byteLength;cb(q.value.byteLength,total);}const out=new Uint8Array(size);let off=0;for(const p of parts){out.set(p,off);off+=p.byteLength;}return out.buffer;}
function cacheName(v,b=''){return 'tha-app-v'+String(v).replace(/[^\w.-]/g,'_')+(b?'-'+String(b).replace(/[^\w.-]/g,'_'):'');}
function releaseRoot(branch){if(typeof branch!=='string'||!branch||branch.includes('..')||! /^[A-Za-z0-9._/-]+$/.test(branch))throw Error('Update channel contains an invalid release branch.');return RAW_ROOT+branch.split('/').map(encodeURIComponent).join('/')+'/';}
async function activateCache(name,pending=false){
 const c=await caches.open(POINTER);
 if(pending){
  const old=await c.match(pointerUrl),previous=old?(await old.json()).cacheName:null;
  if(!previous||previous===name||!await caches.has(previous))throw Error('A verified previous app cache is not available; installation was stopped safely.');
  await c.put(rollbackUrl,new Response(JSON.stringify({previousCache:previous,nextCache:name,version:String(latest?.version||''),buildId:String(latest?.buildId||''),attempts:0,startedAt:Date.now()})));
 }
 await c.put(pointerUrl,new Response(JSON.stringify({cacheName:name})));
 const regs=await navigator.serviceWorker.getRegistrations();for(const r of regs)r.active?.postMessage({type:'ACTIVATE_CACHE',cacheName:name});
}
async function rollbackPendingActivation(reason){
 const c=await caches.open(POINTER),r=await c.match(rollbackUrl);if(!r)return false;
 const p=await r.json();
 if(!p.previousCache||!await caches.has(p.previousCache)){await c.delete(rollbackUrl);throw Error('Previous app cache is unavailable; automatic rollback could not complete. '+(reason||''));}
 await c.put(pointerUrl,new Response(JSON.stringify({cacheName:p.previousCache})));
 await c.delete(rollbackUrl);
 const regs=await navigator.serviceWorker.getRegistrations();for(const reg of regs)reg.active?.postMessage({type:'ACTIVATE_CACHE',cacheName:p.previousCache});
 console.error('New app failed its startup check; restored previous cached app.',reason||'');
 const u=new URL(location.href);u.searchParams.delete('tha-installed-version');u.searchParams.delete('tha-installed-build');u.searchParams.set('tha-rollback','1');location.replace(u.toString());return true;
}
async function confirmPendingActivation(){
 window.__thaPendingActivationDiagnostics={called:true,readyState:document.readyState,localVersion:LOCAL_VERSION,localBuild:LOCAL_BUILD};
 if(!('caches'in window)){window.__thaPendingActivationDiagnostics.noCacheApi=true;return;}
 const run=async()=>{
  window.__thaPendingActivationDiagnostics.runStarted=true;
  try{
   const c=await caches.open(POINTER);window.__thaPendingActivationDiagnostics.pointerOpened=true;
   const r=await c.match(rollbackUrl);window.__thaPendingActivationDiagnostics.markerRead=!!r;
   if(!r){window.__thaPendingActivationDiagnostics.result='no-pending-marker';return;}
   const p=await r.json(),expected=cacheName(LOCAL_VERSION,LOCAL_BUILD);
   window.__thaPendingActivationDiagnostics.pending=p;window.__thaPendingActivationDiagnostics.expected=expected;
   if(p.nextCache!==expected){window.__thaPendingActivationDiagnostics.result='cache-name-mismatch';return;}
   const health={openAccountancy:typeof window.openAccountancy==='function',show:typeof window.show==='function',softwareUpdate:!!el('softwareUpdate'),reloadButton:!!el('appReloadUpdate'),body:!!document.body};
   const healthy=Object.values(health).every(Boolean);
   window.__thaPendingActivationDiagnostics.health=health;console.info('Pending update startup health check', {expected, nextCache:p.nextCache, health});
   if(!healthy){await rollbackPendingActivation('Required app startup components are missing: '+JSON.stringify(health));return;}
   await c.delete(rollbackUrl);
   window.__thaPendingActivationDiagnostics.result='confirmed';console.info('App startup verified; rollback protection cleared for',LOCAL_VERSION,LOCAL_BUILD);
  }catch(e){window.__thaPendingActivationDiagnostics.error=String(e&&e.stack||e);console.error('Could not confirm app startup health.',e);}
 };
 window.__thaPendingActivationDiagnostics.scheduled=true;
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(run,1000),{once:true});else setTimeout(run,1000);
}
async function bootstrap(){
 if(!('serviceWorker'in navigator)||!('caches'in window))return;
 const target=cacheName(LOCAL_VERSION);
 try{
  const reg=await navigator.serviceWorker.register(new URL('service-worker.js',base),{scope:base.pathname});
  await navigator.serviceWorker.ready;
  const pc=await caches.open(POINTER);
  if(!await pc.match(pointerUrl)){
   let c=null;
   try{
    const mr=await fetch(new URL('version.json',base),{cache:'no-store',credentials:'same-origin'});
    if(!mr.ok)throw Error('Bootstrap manifest HTTP '+mr.status);
    const manifest=await mr.json();
    if(manifest.app!=='The Handyman Accountancy'||String(manifest.version)!==String(LOCAL_VERSION)||manifest.buildId!==LOCAL_BUILD||!manifest.files||typeof manifest.files!=='object')throw Error('Bootstrap manifest does not match this installed build.');
    const required=['index.html','version-manager.js','service-worker.js','storage-foundation.js'];
    for(const name of required)if(!/^[a-f0-9]{64}$/i.test(String(manifest.files[name]?.sha256||'')))throw Error('Bootstrap manifest is missing a valid SHA-256 for '+name+'.');
    c=await caches.open(target);
    for(const name of required){
     const url=new URL(name,base),response=await fetch(url,{cache:'no-store',credentials:'same-origin'});
     if(!response.ok)throw Error('Bootstrap download failed for '+name+' (HTTP '+response.status+').');
     const data=await response.arrayBuffer(),actual=await hash(data),expected=String(manifest.files[name].sha256).toLowerCase();
     if(actual!==expected)throw Error('Bootstrap integrity check failed for '+name+'.');
     await c.put(url,new Response(data,{headers:response.headers}));
    }
    await c.put(new URL('version.json',base),new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
    for(const name of required)if(!await c.match(new URL(name,base)))throw Error('Bootstrap cache is incomplete: '+name+'.');
    await activateCache(target);
   }catch(err){if(c)await caches.delete(target);throw err;}
  }
  if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
 }catch(e){console.warn('Offline cache setup unavailable; existing app data was not changed.',e);}
}
function notes(m){const box=el('appReleaseNotes');if(!box)return;box.textContent='';box.style.display='block';const h=document.createElement('strong');h.textContent='Published version '+m.version+' — What this update includes';box.appendChild(h);const list=Array.isArray(m.releaseNotes)?m.releaseNotes:[];if(list.length){const ul=document.createElement('ul');ul.style.paddingLeft='20px';list.forEach(v=>{const li=document.createElement('li');li.textContent=String(v);ul.appendChild(li);});box.appendChild(ul);}else{const p=document.createElement('p');p.textContent='No release notes supplied.';box.appendChild(p);}}
window.checkForAppUpdate=async function(){
 if(busy)return;busy=true;latest=null;staged=null;button(false);progress(0,'',false);
 const check=document.querySelector('button[onclick="checkForAppUpdate(true)"]');if(check){check.disabled=true;check.textContent='Checking…';}
 try{
  status('Checking the update channel…');
  const cr=await fetch(CHANNEL_URL+'?_check='+Date.now(),{cache:'no-store',credentials:'omit',mode:'cors'});if(!cr.ok)throw Error('Update channel HTTP '+cr.status);
  const channel=await cr.json();
  if(channel.app!=='The Handyman Accountancy'||channel.channel!=='test'||!channel.sourceBranch||!/^[a-f0-9]{40}$/i.test(String(channel.sourceCommit||''))||!/^[a-f0-9]{64}$/i.test(String(channel.manifestSha256||'')))throw Error('Invalid update channel manifest.');
  const root=releaseRoot(channel.sourceBranch);
  const mr=await fetch(root+'version.json?_check='+Date.now(),{cache:'no-store',credentials:'omit',mode:'cors'});if(!mr.ok)throw Error('Release manifest HTTP '+mr.status);
  const manifestBytes=await mr.arrayBuffer();if((await hash(manifestBytes)).toLowerCase()!==String(channel.manifestSha256).toLowerCase())throw Error('Release manifest integrity check failed.');
  const m=JSON.parse(new TextDecoder().decode(manifestBytes));
  if(m.app!=='The Handyman Accountancy'||String(m.version)!==String(channel.version)||m.buildId!==channel.buildId||m.releaseBranch!==channel.sourceBranch||!m.files||typeof m.files!=='object')throw Error('Release manifest does not match the update channel.');
  if(compare(m.version,LOCAL_VERSION)<0)throw Error('The update channel points to an older app version. Downgrades are blocked.');latest=m;notes(m);const newer=compare(m.version,LOCAL_VERSION)>0||m.buildId!==LOCAL_BUILD;
  if(!newer){status('This installation is up to date.');return;}
  status('Version '+m.version+' found. Downloading and verifying files; installation will wait for your confirmation.');
  const names=[...new Set(['index.html','version.json',...Object.keys(m.files)])],c=await caches.open(cacheName(m.version,m.buildId));let done=0;
  for(const n of names){const expected=n==='version.json'?String(channel.manifestSha256):m.files[n]?.sha256;if(!/^[a-f0-9]{64}$/i.test(String(expected||'')))throw Error('Missing SHA-256 for '+n);
   const url=n==='version.json'?root+'version.json':root+n;let fileLoaded=0;
   const b=await bytes(url,(delta,len)=>{fileLoaded+=delta;const within=len?Math.min(.99,fileLoaded/len):.5;progress(Math.min(94,(done+within)/names.length*94),'Downloading '+n);});
   if((await hash(b)).toLowerCase()!==String(expected).toLowerCase())throw Error('Integrity check failed: '+n);
   const localUrl=new URL(n,base);await c.put(localUrl,new Response(b,{headers:{'Content-Type':n.endsWith('.json')?'application/json':n.endsWith('.js')?'text/javascript':'text/html'}}));done++;progress(done/names.length*94,'Verified '+done+' of '+names.length+' files');
  }
  if(!await c.match(new URL('index.html',base))||!await c.match(new URL('version-manager.js',base))||!await c.match(new URL('service-worker.js',base)))throw Error('Staged app package is incomplete.');
  staged=cacheName(m.version,m.buildId);progress(100,'Download and verification complete');status('Version '+m.version+' is downloaded and verified. Press Update Now when you are ready to install it.');button(true,'Update Now');
 }catch(e){latest=null;staged=null;progress(0,'',false);status('Update failed: '+(e.message||e)+'. The current installation and saved records were not changed.');}
 finally{busy=false;if(check){check.disabled=false;check.textContent='🔄 Check for Updates';}}
};
window.reloadLatestApp=async function(){
 if(!latest||!staged){status('Check for updates and finish the download first.');return;}if(busy)return;busy=true;button(false,'Installing…');progress(100,'Activating verified update…');
 try{await activateCache(staged,true);const u=new URL(location.href);u.searchParams.set('tha-installed-version',String(latest.version));u.searchParams.set('tha-installed-build',latest.buildId);u.hash='';status('Installing version '+latest.version+'…');location.replace(u.toString());}
 catch(e){busy=false;button(true,'Update Now');status('Could not activate update: '+(e.message||e)+'. Previous cache remains available.');}
};
const installed=el('appInstalledVersion');if(installed)installed.textContent='Installed version: '+LOCAL_VERSION+' · '+LOCAL_BUILD;button(false);
bootstrap().then(()=>confirmPendingActivation());
try{const p=new URL(location.href).searchParams,v=p.get('tha-installed-version'),b=p.get('tha-installed-build');if(v){if(v===LOCAL_VERSION&&b===LOCAL_BUILD){if(typeof window.openAccountancy==='function')window.openAccountancy();if(typeof window.show==='function')window.show('softwareUpdate');status('Update successful. Version '+LOCAL_VERSION+' is installed. You are still on Software Update.');}else status('Update confirmation failed: loaded '+LOCAL_VERSION+' ('+LOCAL_BUILD+'), expected '+v+' ('+b+').');const u=new URL(location.href);u.searchParams.delete('tha-installed-version');u.searchParams.delete('tha-installed-build');history.replaceState(null,'',u.toString());}}catch(e){status('Update loaded, but confirmation display failed: '+e.message);}
})();
