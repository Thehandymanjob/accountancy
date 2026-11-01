'use strict';
const SCOPE=new URL(self.registration.scope);
const POINTER_CACHE='tha-active-pointer-v1';
const POINTER_URL=new URL('__tha_active_cache__',SCOPE).toString();
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
 const d=e.data||{};
 if(d.type==='ACTIVATE_CACHE'&&typeof d.cacheName==='string'&&/^tha-app-v[\w.-]+$/.test(d.cacheName)){
  e.waitUntil((async()=>{const c=await caches.open(POINTER_CACHE);await c.put(POINTER_URL,new Response(JSON.stringify({cacheName:d.cacheName})));await self.clients.claim();if(e.ports&&e.ports[0])e.ports[0].postMessage({ok:true});})());
 }
});
async function activeName(){try{const c=await caches.open(POINTER_CACHE),r=await c.match(POINTER_URL);if(r)return (await r.json()).cacheName;}catch(e){}return 'tha-app-v223-bootstrap';}
function keyFor(req){const u=new URL(req.url);if(req.mode==='navigate'&&u.pathname===SCOPE.pathname)return new URL('index.html',SCOPE).toString();return u.toString();}
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==SCOPE.origin||!u.pathname.startsWith(SCOPE.pathname))return;
 e.respondWith((async()=>{const c=await caches.open(await activeName()),key=keyFor(r),hit=await c.match(key);if(hit)return hit;try{return await fetch(r);}catch(err){if(r.mode==='navigate'){const shell=await c.match(new URL('index.html',SCOPE).toString());if(shell)return shell;}throw err;}})());
});