'use strict';
const SCOPE=new URL(self.registration.scope);
const POINTER_CACHE='tha-active-pointer-v1';
const POINTER_URL=new URL('__tha_active_cache__',SCOPE).toString();
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function activeCacheName(){
 try{
  const pointer=await caches.open(POINTER_CACHE);
  const response=await pointer.match(POINTER_URL);
  if(response){const data=await response.json();if(data&&/^tha-app-v[\\w.-]+$/.test(data.cacheName))return data.cacheName;}
 }catch(error){}
 return 'tha-app-bootstrap-v223';
}
function cacheKey(request){
 const url=new URL(request.url);
 if(request.mode==='navigate'&&url.pathname===SCOPE.pathname)return new URL('index.html',SCOPE).toString();
 return url.toString();
}
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(await activeCacheName());
  const key=cacheKey(request);
  const cached=await cache.match(key);
  if(cached)return cached;
  try{return await fetch(request);}
  catch(error){
   if(request.mode==='navigate'){
    const shell=await cache.match(new URL('index.html',SCOPE).toString());
    if(shell)return shell;
   }
   throw error;
  }
 })());
});