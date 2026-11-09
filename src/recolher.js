// Premissas e comentários recolhidos em todas as abas: as notas explicativas de cada quadro (.pm-note no cabeçalho
// ou soltas no quadro, .pm-recolher) e os rodapés de página (.pm-foot) vão para um botão "Premissas e comentários"
// que abre e fecha. Os elementos são só movidos (mantêm o id), então os scripts das abas continuam preenchendo.
// Ficam de fora: o subtítulo da Leitura do analista, avisos dentro das ferramentas (.pm-tools) e notas criadas
// dentro do conteúdo (tabelas, gráficos, fichas).
(function () {
  const css = document.createElement('style');
  css.textContent = '.pm-info{margin-top:var(--cds-gap-sm,.5rem)}.pm-info>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:.35rem;font-size:var(--cds-font-size-caption,.8rem);color:var(--color-fg-muted);border:1px solid var(--color-border-line);border-radius:999px;padding:.15rem .7rem;user-select:none}.pm-info>summary::-webkit-details-marker{display:none}.pm-info>summary::before{content:"ⓘ"}.pm-info>summary::after{content:"▾";font-size:.8em}.pm-info[open]>summary::after{content:"▴"}.pm-info>summary:hover{color:var(--color-fg)}.pm-info>.pm-info-corpo{margin-top:.4rem;display:flex;flex-direction:column;gap:.35rem}.pm-info>.pm-info-corpo>.pm-note{margin:0}.pm-card>.pm-info{order:99}.pm-foot-info{margin:0 0 var(--cds-gap-lg,1rem)}';
  document.head.appendChild(css);
  const abertos = new Set();
  let n = 0;
  function caixa(chave) {
    const d = document.createElement('details'); d.className = 'pm-info'; d.dataset.chave = chave;
    if (abertos.has(chave)) d.open = true;
    d.addEventListener('toggle', () => { d.open ? abertos.add(chave) : abertos.delete(chave); });
    const s = document.createElement('summary'); s.textContent = 'Premissas e comentários';
    const c = document.createElement('div'); c.className = 'pm-info-corpo';
    d.append(s, c); return d;
  }
  const pula = (e) => e.classList.contains('pm-an-sub') || e.closest('.pm-tools, .pm-info, .pm-analise .pm-an-grid');
  function notasDoCard(card) {
    const out = [];
    for (const e of card.querySelectorAll(':scope > .pm-note, :scope > .pm-recolher, :scope > .pm-card-head > div > .pm-note, :scope > .pm-card-head > .pm-note')) if (!pula(e)) out.push(e);
    return out;
  }
  function vazio(d) { return ![...d.querySelector('.pm-info-corpo').children].some((e) => e.classList.contains('pm-recolher') || (e.textContent || '').trim()); }
  let rodando = false;
  function roda() {
    if (rodando) return; rodando = true;
    try {
      for (const card of document.querySelectorAll('section.pm-card, .pm-card')) {
        if (card.closest('.pm-info')) continue;
        const ns = notasDoCard(card);
        let d = card.querySelector(':scope > .pm-info');
        if (ns.length) {
          if (!d) { d = caixa(card.id || 'c' + (++n)); card.appendChild(d); }
          const corpo = d.querySelector('.pm-info-corpo');
          for (const e of ns) corpo.appendChild(e);
        }
        if (d && d !== card.lastElementChild) card.appendChild(d);
        if (d) d.hidden = vazio(d);
      }
      for (const f of document.querySelectorAll('.pm-foot')) {
        if (f.closest('.pm-info')) continue;
        const d = caixa(f.id || 'f' + (++n)); d.classList.add('pm-foot-info');
        f.parentNode.insertBefore(d, f); d.querySelector('.pm-info-corpo').appendChild(f);
      }
      for (const d of document.querySelectorAll('.pm-foot-info')) d.hidden = vazio(d);
    } finally { rodando = false; }
  }
  let agendado = false;
  const agenda = () => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; roda(); }); };
  const inicia = () => { roda(); new MutationObserver(agenda).observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia); else inicia();
})();
