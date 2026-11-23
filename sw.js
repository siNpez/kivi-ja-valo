/* Kivi & valo – offline-tuki */
const VERSION = 'kv-2026-11-23e';
const CORE = 'kv-core-' + VERSION;
const IMG = 'kv-img-v1';          // kuvat säilyvät versiopäivitysten yli
const EXT = 'kv-ext-v1';          // kirjastot ja fontit

const CORE_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './og.jpg'];
const EXT_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Sky.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE); await c.addAll(CORE_FILES);
    const x = await caches.open(EXT);
    await Promise.all(EXT_FILES.map(u => x.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('kv-core-') && k !== CORE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function cacheFirst(req, name) {
  const hit = await caches.match(req, { ignoreSearch: name === IMG });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) (await caches.open(name)).put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CORE)).put(req, res.clone());
    return res;
  } catch (err) {
    return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html'));
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) { e.respondWith(networkFirst(req)); return; }
  if (url.origin === location.origin && url.pathname.includes('/img/')) { e.respondWith(cacheFirst(req, IMG)); return; }
  if (url.origin === location.origin) { e.respondWith(cacheFirst(req, CORE)); return; }
  if (/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(url.hostname)) { e.respondWith(cacheFirst(req, EXT)); return; }
});

/* Koko oppaan tallennus: sivu lähettää kuvalistan, työntekijä raportoi edistymisen */
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'cache-all') {
    e.waitUntil((async () => {
      const c = await caches.open(IMG); const urls = d.urls || []; let done = 0, failed = 0;
      const post = (msg) => self.clients.matchAll().then(cl => cl.forEach(k => k.postMessage(msg)));
      const queue = urls.slice(); const workers = [];
      for (let w = 0; w < 4; w++) workers.push((async () => {
        while (queue.length) {
          const u = queue.shift();
          try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); else failed++; } } catch (err) { failed++; }
          done++; if (done % 3 === 0 || done === urls.length) post({ type: 'cache-progress', done, total: urls.length, failed });
        }
      })());
      await Promise.all(workers);
      post({ type: 'cache-done', total: urls.length, failed });
    })());
  }
  if (d.type === 'cache-status') {
    e.waitUntil((async () => {
      const c = await caches.open(IMG); let have = 0;
      for (const u of d.urls || []) if (await c.match(u)) have++;
      e.source && e.source.postMessage({ type: 'cache-status', have, total: (d.urls || []).length });
    })());
  }
});
