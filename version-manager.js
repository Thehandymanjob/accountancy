/* Central version manager: version.json is the published source of truth. */
(function(){
"use strict";
const LOCAL_VERSION=document.querySelector('meta[name="app-version"]')?.content||"";
const LOCAL_BUILD=document.querySelector('meta[name="app-build-id"]')?.content||"";
let latest=null;
const $=id=>document.getElementById(id);
function compare(a,b){const x=String(a).split(".").map(n=>parseInt(n,10)||0),y=String(b).split(".").map(n=>parseInt(n,10)||0);for(let i=0;i<Math.max(x.length,y.length);i++){let p=x[i]||0,q=y[i]||0;if(p!==q)return p>q?1:-1;}return 0;}
function status(s){const e=$("appUpdateStatus");if(e)e.textContent=s;}
async function sha(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("Cannot fetch "+url+" ("+r.status+")");const b=await crypto.subtle.digest("SHA-256",await r.arrayBuffer());return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,"0")).join("");}
window.checkForAppUpdate=async function(){
 const b=document.querySelector('[data-action="check-app-update"]');
 const label=$("appInstalledVersion");if(label)label.textContent="Installed version: "+LOCAL_VERSION+" · "+LOCAL_BUILD;
 if(b){b.disabled=true;b.textContent="Checking…";}status("Loading central version manifest…");
 try{
  const u=new URL("version.json",document.baseURI);u.searchParams.set("_",Date.now());
  const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw Error("version.json HTTP "+r.status);
  const m=await r.json();if(m.app!=="The Handyman Accountancy"||!m.version||!m.buildId||!m.files)throw Error("Invalid central manifest");
  for(const [name,meta] of Object.entries(m.files)){if(!meta.sha256)throw Error("No SHA-256 for "+name);const f=new URL(name,document.baseURI);f.searchParams.set("_verify",Date.now());if((await sha(f)).toLowerCase()!==String(meta.sha256).toLowerCase())throw Error("Integrity check failed: "+name);}
  latest=m;const newer=compare(m.version,LOCAL_VERSION)>0||m.buildId!==LOCAL_BUILD;
  status("Installed: "+LOCAL_VERSION+" ("+LOCAL_BUILD+"). Published: "+m.version+" ("+m.buildId+"). All "+Object.keys(m.files).length+" file hashes verified. "+(newer?"A different/newer build is available.":"This build is current."));
  const ub=$("appReloadUpdate");if(ub){ub.disabled=!newer;ub.setAttribute("aria-disabled",String(!newer));}
 }catch(e){latest=null;status("Version check failed: "+e.message+". No changes were made.");const ub=$("appReloadUpdate");if(ub)ub.disabled=true;}
 finally{if(b){b.disabled=false;b.textContent="🔄 Check for Updates";}}
};
window.reloadLatestApp=function(){if(!latest){status("Run a successful version check first.");return;}const u=new URL(location.href);u.searchParams.set("app-version",latest.version);u.searchParams.set("app-build",latest.buildId);u.searchParams.set("refresh",Date.now());location.replace(u.href);};
const label=$("appInstalledVersion");if(label)label.textContent="Installed version: "+LOCAL_VERSION+" · "+LOCAL_BUILD;
})();