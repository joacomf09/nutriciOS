const C='nutricios-v50';const A=['./','index.html','app.js','engine.js','manifest.webmanifest','icon-192.png','icon-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim();});
// red primero y revalidando (no-cache): GitHub Pages sirve con max-age=600 y sin esto la caché HTTP devuelve archivos viejos; caché si no hay conexión
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||e.request.url.includes('version.json'))return;e.respondWith(fetch(e.request,new URL(e.request.url).origin===location.origin?{cache:'no-cache'}:undefined).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));});
