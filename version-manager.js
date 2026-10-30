/* Central version manager: version.json is the published source of truth.
   Checks the actual manifest, build identity, and SHA-256 of published assets. */
(function(){
  "use strict";
  const LOCAL_VERSION=document.querySelector('meta[name="app-version"]')?.content || "";
  const LOCAL_BUILD=document.querySelector('meta[name="app-build-id"]')?.content || "";
  const MANIFEST_URL=new URL("version.json", document.baseURI);
  let latest=null;
  const $=id=>document.getElementById(id);
  function cmp(a,b){
    const aa=String(a).split(".").map(x=>parseInt(x,10)||0), bb=String(b).split(".").map(x=>parseInt(x,10)||0);
    for(let i=0;i<Math.max(aa.length,bb.length);i++){const x=aa[i]||0,y=bb[i]||0;if(x!==y)return x>y?1:-1;}return 0;
  }
  function setStatus(msg){const el=$("appUpdateStatus");if(el)el.textContent=msg;}
  function hex(buf){return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");}
  async function digest(url){
    if(!crypto?.subtle) throw new Error("Secure SHA-256 verification is unavailable in this browser");
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error("Could not retrieve "+url+" (HTTP "+r.status+")");
    return hex(await crypto.subtle.digest("SHA-256",await r.arrayBuffer()));
  }
  async function fetchManifest(){
    const u=new URL(MANIFEST_URL);u.searchParams.set("_",String(Date.now()));
    const r=await fetch(u,{cache:"no-store",headers:{"Cache-Control":"no-cache"}});
    if(!r.ok)throw new Error("version.json could not be loaded (HTTP "+r.status+")");
    const m=await r.json();
    if(m.app!=="The Handyman Accountancy" || !m.version || !m.buildId || !m.files || !m.files["index.html"])
      throw new Error("The version manifest is incomplete or invalid");
    return m;
  }
  async function verifyAssets(m){
    const results=[];
    for(const [name,meta] of Object.entries(m.files)){
      if(!meta.sha256)throw new Error("Missing SHA-256 for "+name);
      const url=new URL(name,document.baseURI);url.searchParams.set("_verify",String(Date.now()));
      const actual=await digest(url);
      const ok=actual.toLowerCase()===String(meta.sha256).toLowerCase();
      results.push({name,ok,expected:meta.sha256,actual});
      if(!ok)throw new Error("Integrity check failed for "+name);
    }
    return results;
  }
  window.checkForAppUpdate=async function(){
    const btn=document.querySelector('button[onclick="checkForAppUpdate(true)"]');
    const installed=$("appInstalledVersion");
    if(installed)installed.textContent="Installed version: "+LOCAL_VERSION+" · "+LOCAL_BUILD;
    if(btn){btn.disabled=true;btn.textContent="Checking manifest…";}
    setStatus("Reading the central version manifest…");
    try{
      const m=await fetchManifest();
      const newer=cmp(m.version,LOCAL_VERSION)>0;
      const sameVersionDifferentBuild=cmp(m.version,LOCAL_VERSION)===0 && m.buildId!==LOCAL_BUILD;
      latest=m;
      const details="Published version: "+m.version+" · Build: "+m.buildId+" · Database schema: "+m.databaseSchema;
      if(newer || sameVersionDifferentBuild){
        setStatus(details+". Verifying published files…");
        const verified=await verifyAssets(m);
        setStatus(details+". Verified "+verified.length+" published file(s). "+(newer?"A newer version is available.":"The published build differs from this installed build."));
        const update=$("appReloadUpdate");if(update){update.disabled=false;update.setAttribute("aria-disabled","false");update.textContent="Update Now";}
      }else{
        const verified=await verifyAssets(m);
        setStatus(details+". This build is current. "+verified.length+" file(s) verified.");
        const update=$("appReloadUpdate");if(update){update.disabled=true;update.setAttribute("aria-disabled","true");}
      }
    }catch(e){
      latest=null;setStatus("Version check failed: "+(e?.message||String(e))+". No update has been applied.");
      const update=$("appReloadUpdate");if(update){update.disabled=true;update.setAttribute("aria-disabled","true");}
    }finally{if(btn){btn.disabled=false;btn.textContent="🔄 Check for Updates";}}
  };
  window.reloadLatestApp=function(){
    if(!latest){setStatus("Check and verify the published manifest before updating.");return;}
    const u=new URL(location.href);
    u.searchParams.set("app-version",latest.version);
    u.searchParams.set("app-build",latest.buildId);
    u.searchParams.set("app-refresh",String(Date.now()));
    u.hash="";
    location.replace(u.toString());
  };
  const label=$("appInstalledVersion");
  if(label)label.textContent="Installed version: "+LOCAL_VERSION+" · "+LOCAL_BUILD;
})();