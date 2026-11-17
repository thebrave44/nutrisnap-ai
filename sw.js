/* NutriSnap AI service worker — offline app shell + cached AI model */
const CACHE = "nutrisnap-v4";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "data.js", "labels.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png",
  "vendor/onnxruntime-web/ort.min.js",
  "vendor/onnxruntime-web/ort-wasm-simd.wasm",
  "vendor/onnxruntime-web/ort-wasm.wasm",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // never cache the nutrition API — always fresh
  if (url.hostname.includes("openfoodfacts.org")) return;
  // AI model: cache-first, fill cache on demand
  if (url.pathname.endsWith(".onnx")) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }))
    );
    return;
  }
  // app shell: network-first (so updates show immediately), cache fallback
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok && url.origin === location.origin) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("index.html")))
  );
});
