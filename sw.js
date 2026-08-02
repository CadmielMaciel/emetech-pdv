/* ============================================================================
 * sw.js — MISU SYS  (versão 2026-08-02-03)
 * Navegação sempre pela REDE (index.html nunca fica preso no cache),
 * limpa caches antigos e ativa imediatamente. Corrige o "shell preso".
 * ========================================================================== */
const CACHE_NAME = 'misu-sys-2026-08-02-03';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ),
    self.clients.claim()
  ]));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Navegação (index.html): sempre rede, sem cache. Fallback só se offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => caches.match('/index.html'))
    );
    return;
  }
  // Demais requisições: comportamento padrão do navegador (rede).
});
