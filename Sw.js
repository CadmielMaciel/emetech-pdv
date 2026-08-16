/* ============================================================================
 * sw.js — MISU SYS  (versão 2026-08-16-01)
 *
 * REGRA INTOCÁVEL (herdada da versão anterior, não mudei):
 * Navegação (páginas HTML) sempre pela REDE, sem cache — index.html nunca
 * fica preso em versão antiga. Foi o que corrigiu o "shell preso" antes
 * desta fatia, então mantive esse trecho exatamente como estava.
 *
 * Fatia 15 — o que mudou:
 * 1) Cache-first só para ícones + manifest.json (binários estáticos que
 *    quase nunca mudam) — antes o CACHE_NAME existia mas nada era
 *    cacheado de verdade.
 * 2) Fallback offline de verdade — antes tentava servir '/index.html' do
 *    cache, mas como nada nunca era cacheado, isso sempre falhava
 *    silenciosamente. Agora mostra uma página simples embutida aqui
 *    mesmo (não criei nenhum arquivo novo).
 * 3) Nada de Supabase/API/fotos de produto entra no cache — essas
 *    requisições nem passam pelas duas regras acima, seguem o
 *    comportamento padrão do navegador (rede).
 * ========================================================================== */
const CACHE_NAME = 'misu-sys-2026-08-16-01';

// Só binários estáticos versionados por este CACHE_NAME — nunca HTML,
// nunca resposta do Supabase, nunca nada com dado de usuário/empresa.
const PRECACHE_URLS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png'
];

// Fallback simples de offline — só dentro deste arquivo, sem tocar em
// nenhum outro. Não promete venda/pagamento/sincronização offline.
const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Você está offline — MISU SYS</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#070B1A;color:#EAF0FF;font-family:system-ui,-apple-system,'DM Sans',sans-serif;
    text-align:center;padding:24px}
  .box{max-width:320px}
  .ico{font-size:44px;margin-bottom:14px}
  h1{font-size:17px;margin:0 0 8px}
  p{font-size:13.5px;color:#A8BAE8;line-height:1.6;margin:0}
  button{margin-top:18px;padding:12px 22px;border:none;border-radius:11px;background:#1E5EFF;
    color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
</style></head><body><div class="box">
  <div class="ico">📶</div>
  <h1>Você está offline</h1>
  <p>Verifique sua conexão e tente novamente.</p>
  <button onclick="location.reload()">Tentar novamente</button>
</div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE_URLS.map((path) =>
        fetch(path, { cache: 'reload' })
          .then((res) => { if (res && res.ok) return cache.put(path, res); })
          .catch(() => {}) // um ícone falhando não pode travar a instalação do app
      ))
    ).then(() => self.skipWaiting())
  );
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
  if (request.method !== 'GET') return; // nunca intercepta POST/PUT/PATCH (Supabase, RPCs, etc.)

  // Navegação (páginas HTML): sempre rede, sem cache. Só cai no fallback
  // offline se a rede falhar de verdade (sem conexão) — um 404/500 real
  // do servidor continua chegando normal, não é mascarado.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() =>
        new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      )
    );
    return;
  }

  // Ícones/manifest desta lista fixa: cache-first (atualiza sozinho quando
  // o CACHE_NAME muda de versão). Qualquer outra URL — Supabase, RPC, API,
  // foto de produto/OS, página pública via fetch, etc. — nunca entra aqui,
  // segue o comportamento padrão do navegador (rede).
  const url = new URL(request.url);
  if (url.origin === self.location.origin && PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
