/* ============================================================================
 * sw.js — VERSÃO SEGURA (corrige o service worker preso / shell quebrado)
 * ----------------------------------------------------------------------------
 * Substitui o /sw.js atual na RAIZ do projeto (Vercel).
 * O que ele faz:
 *   - Ativa imediatamente (skipWaiting + clients.claim).
 *   - APAGA todos os caches antigos — inclui o shell quebrado que estava
 *     causando o crash em loop no celular.
 *   - NÃO cacheia mais o HTML/JS (network-only) — acaba o "cache poisoning".
 *   - Força os clientes já abertos a recarregarem da rede.
 *
 * Depois que o app voltar a abrir normalmente, dá pra reintroduzir cache
 * offline com versionamento (me peça e eu faço uma versão com cache seguro).
 * ========================================================================== */

const VERSION = 'misu-safe-v1';

self.addEventListener('install', () => {
  // não espera a aba antiga fechar — assume o controle na hora
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1) apaga TODOS os caches (inclui o shell quebrado)
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));

    // 2) assume o controle das abas abertas
    await self.clients.claim();

    // 3) força os clientes presos a recarregar (agora vem da rede, corrigido)
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) {
      try { await c.navigate(c.url); } catch (_) { /* ignora */ }
    }
  })());
});

// Sempre busca da rede — nunca serve HTML/JS de cache (fim do poisoning).
// Se a rede falhar, deixa o navegador tratar (não serve versão velha).
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
