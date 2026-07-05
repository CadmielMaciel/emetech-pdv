/* ══════════════════════════════════════════════════════════════
   MISU TECNOLOGY — Service Worker (PWA)
   Estratégia:
   - App shell (index): NETWORK-FIRST → atualizações chegam na hora;
     se offline, serve a última versão cacheada.
   - Ícones/manifest: cache-first (mudam raramente).
   - Supabase (API/Auth/Realtime): NUNCA intercepta — passa direto.
     O modo offline do PDV usa IndexedDB no próprio app.
   ══════════════════════════════════════════════════════════════ */
const CACHE = 'misu-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {})) // tolera falha parcial
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Nunca interceptar Supabase (API, Auth, Realtime/WebSocket) nem métodos não-GET
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // Navegação (abrir o app): network-first com fallback ao cache (offline)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copia)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Estáticos same-origin (ícones, manifest): cache-first com atualização em fundo
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cacheado) => {
        const rede = fetch(e.request)
          .then((resp) => {
            caches.open(CACHE).then((c) => c.put(e.request, resp.clone())).catch(() => {});
            return resp;
          })
          .catch(() => cacheado);
        return cacheado || rede;
      })
    );
    return;
  }
  // CDNs externos (fonts, libs): comportamento padrão do navegador (HTTP cache)
});
