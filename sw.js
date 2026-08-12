self.addEventListener("install",e=>{e.waitUntil(self.skipWaiting())});
self.addEventListener("activate",e=>{e.waitUntil(self.clients.claim())});
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));
});
