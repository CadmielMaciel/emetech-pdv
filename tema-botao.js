/* MISU — botão de tema claro/escuro (canto superior direito).
   Usado nas páginas públicas (cliente, entregador, documentos, nova senha).
   - Mesma chave do sistema: localStorage 'misu_tema' ('light' | 'dark').
   - O tema inicial já é aplicado no <head> de cada página (sem "piscada");
     aqui só criamos o botão e trocamos o tema ao clicar.
   - O botão é sempre azul (identidade MISU) nos dois temas, com ícone branco.
   - Se a página tiver window._aoTrocarTema, ela é chamada depois da troca
     (para redesenhar cores calculadas em JS).
   - Fica no canto superior direito da página (position:absolute — some ao
     rolar, para não cobrir o conteúdo). Para colocá-lo dentro de um
     cabeçalho, a página pode ter um elemento com [data-tema-slot]. */
(function(){
  if (window.__misuTemaBotao) return; window.__misuTemaBotao = true;
  var SOL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var LUA = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var css = ''
    + '.misu-tema-btn{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));right:calc(10px + env(safe-area-inset-right,0px));z-index:2147483000;'
    + 'width:44px;height:44px;border-radius:50%;border:1.5px solid rgba(255,255,255,.55);padding:0;margin:0;cursor:pointer;'
    + 'display:inline-flex;align-items:center;justify-content:center;color:#FFFFFF;'
    + 'background:linear-gradient(135deg,#1E5EFF,#1A4FD9);box-shadow:0 6px 18px -6px rgba(30,94,255,.65),0 1px 3px rgba(0,0,0,.18);'
    + '-webkit-tap-highlight-color:transparent;transition:transform .15s ease,box-shadow .15s ease}'
    + '.misu-tema-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px -6px rgba(30,94,255,.75),0 1px 3px rgba(0,0,0,.18)}'
    + '.misu-tema-btn:active{transform:scale(.94)}'
    + '.misu-tema-btn:focus-visible{outline:3px solid #8AB0FF;outline-offset:3px}'
    + '[data-theme="dark"] .misu-tema-btn{border-color:rgba(138,176,255,.55);box-shadow:0 6px 18px -6px rgba(30,94,255,.8),0 0 0 1px rgba(0,0,0,.3)}'
    + '.misu-tema-btn.no-slot{position:static}'
    + '@media print{.misu-tema-btn{display:none!important}}'
    + '@media (prefers-reduced-motion:reduce){.misu-tema-btn{transition:none}}';
  function tema(){ return document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light'; }
  function pintar(btn){
    var dark = tema()==='dark';
    btn.innerHTML = dark ? SOL : LUA;
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    var rot = dark ? 'Mudar para tema claro' : 'Mudar para tema escuro';
    btn.setAttribute('aria-label', rot); btn.title = rot;
  }
  function montar(){
    if (document.querySelector('.misu-tema-btn')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'misu-tema-btn'; btn.id = 'misu-tema-btn';
    pintar(btn);
    btn.addEventListener('click', function(){
      var novo = tema()==='dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', novo);
      try{ localStorage.setItem('misu_tema', novo); }catch(e){}
      if (typeof window._aoTrocarTema === 'function'){ try{ window._aoTrocarTema(); }catch(e){} }
    });
    // Mantém o ícone certo se o tema mudar por outro caminho (tema do aparelho, outra aba)
    try{ new MutationObserver(function(){ pintar(btn); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']}); }catch(e){}
    window.addEventListener('storage', function(ev){
      if (ev.key==='misu_tema' && (ev.newValue==='dark'||ev.newValue==='light') && ev.newValue!==tema()){
        document.documentElement.setAttribute('data-theme', ev.newValue);
        if (typeof window._aoTrocarTema === 'function'){ try{ window._aoTrocarTema(); }catch(e){} }
      }
    });
    var slot = document.querySelector('[data-tema-slot]');
    if (slot){ btn.classList.add('no-slot'); slot.appendChild(btn); }
    else document.body.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
