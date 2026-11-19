// Coque hors-ligne : réseau d'abord, cache en secours. Les taux de change (autre origine) ne passent pas ici.
const CACHE = 'arvo-v3';   // v3 : lecteur PP-OCRv6 ; l'activation supprime les caches précédents (dont l'ancien moteur Tesseract)
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.webmanifest', 'icons/icon.svg'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('arvo-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Moteur et modèles de l'OCR (plusieurs dizaines de Mo, jamais modifiés) : cache d'abord, pour ne les télécharger qu'une fois.
  if (u.pathname.includes('/models/') || u.pathname.endsWith('.wasm')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(e.request).then((res) => {
    if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('./'))));
});
