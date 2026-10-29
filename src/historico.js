// Histórico mensal de um produto (GMV e ticket médio por peça) ao clicar numa linha da tabela "Vendas por produto".
// Painel do GitHub: lê DADOS.produtos. Painel do Claude: lê o arquivo "historico_produtos".
(function () {
  const tamanho = (v) => {
    if (!v || v === 'Default Title') return 'Único';
    for (const p of String(v).split('/').map((s) => s.trim())) {
      const m = p.match(/^(\d{1,2}|PP|P|M|G|GG|XG|XGG)(?:\s*\(\s*\d+\s*-\s*\d+\s*\))?$/i);
      if (m) { const t = m[1].toUpperCase(); return /^\d$/.test(t) ? '0' + t : t; }
    }
    return 'Único';
  };
  const estampa = (t) => {
    const x = String(t || '').toLowerCase();
    const regras = [['passarinho', 'Voa Passarinho'], ['viagem colorida', 'Viagem Colorida'], ['dia de brincar', 'Dia de Brincar'], ['pets', 'Pets'], ['alfabeto', 'Alfabeto da PINTA'], ['caça-palavras', 'Alfabeto da PINTA'], ['copa do mundo', 'Copa do Mundo / Futebol'], ['futebol', 'Copa do Mundo / Futebol'], ['mergulho', 'Um Mergulho na Ilha'], ['frutaria', 'Frutaria'], ['natal', 'Natal'], ['tangram', 'Tangram'], ['vira!', 'VIRA!'], ['arvoredo', 'Arvoredo'], ['amarelinho', 'Copa do Mundo / Futebol']];
    for (const [k, v] of regras) if (x.includes(k)) return v;
    return 'Sem estampa';
  };
  const categoriaDe = (titulo, tipo) => {
    const t = String(titulo || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const regras = [[/^camiseta adulto/, 'Camiseta Adulto'], [/^camiseta/, 'Camiseta Infantil'], [/^vestido/, 'Vestido Infantil'], [/^cropped/, 'Cropped Infantil'], [/^blusa/, 'Blusa Infantil'], [/^cal[cç]a/, 'Calça Infantil'], [/^bermuda/, 'Bermuda Infantil'], [/^short/, 'Short Saia Infantil'], [/^moletom/, 'Moletom Infantil'], [/^t[eê]nis/, 'Tênis'], [/^estojo/, 'Estojo'], [/mochila|lancheira/, 'Mochila e Lancheira'], [/^meia/, 'Meia'], [/boneca|boneco|de pano/, 'Boneca de Pano'], [/^kit de \d+ canetinhas/, 'Canetinhas'], [/embalagem|envelope|box presente/, 'Embalagem'], [/bandeirola/, 'Decoração'], [/^livro/, 'Livro'], [/kit conjunto escolar/, 'Kit Escolar'], [/lista vip|^kit /, 'Kit'], [/scrunchie|copo/, 'Acessório'], [/teste/, 'Teste']];
    for (const [re, c] of regras) if (re.test(t)) return c;
    return tipo ? String(tipo).trim() : 'Sem categoria';
  };

  const TXT = new Set(['product_type', 'product_title', 'product_variant_title']);
  const abre = (c) => Array.isArray(c) ? c : c.linhas.map((l) => Object.fromEntries(c.campos.map((f, i) => [f, TXT.has(f) ? c.dic[l[i]] : l[i]])));
  let cache = null;
  function fonte() {
    if (cache) return cache;
    if (typeof DADOS !== 'undefined' && DADOS && DADOS.produtos) {
      cache = abre(DADOS.produtos).filter((r) => r.product_title).map((r) => ({ month: String(r.month).slice(0, 7), product_type: r.product_type, product_title: r.product_title, product_variant_title: r.product_variant_title, net_items_sold: r.net_items_sold || 0, gmv: (r.gross_sales || 0) + (r.discounts || 0) }));
      return cache;
    }
    const d = window.dash && dash.data('historico_produtos');
    if (d && d.status === 'ok') { cache = (Array.isArray(d.data) ? d.data : d.data.rows || []).map((r) => ({ ...r, month: String(r.month).slice(0, 7), gmv: +r.gmv || 0, net_items_sold: +r.net_items_sold || 0 })); return cache; }
    return d ? d.status : 'missing';
  }
  const idDe = (r, d) => {
    const produto = String(r.product_title).replace(/\s+/g, ' ').trim();
    const e = d.includes('estampa') ? estampa(r.product_title) : '', c = d.includes('categoria') ? categoriaDe(r.product_title, r.product_type) : '';
    const p = d.includes('produto') ? produto : '', t = d.includes('tamanho') ? tamanho(r.product_variant_title) : '';
    return d + '|' + [e, c, p, t].filter(Boolean).join(' · ');
  };

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nomeMes = (k) => new Date(k + '-15T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const addMes = (k, n) => { let [y, m] = k.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); };

  let card = null, aberto = null, tentativas = 0;
  function garanteCard() {
    if (card) return card;
    const st = el('style'); st.textContent = '#tabela tbody tr[data-key]:not([data-key="total"]){cursor:pointer}#tabela tbody tr.pm-sel td{background:color-mix(in srgb,var(--color-fg) 6%,transparent)}.pm-hist-resumo{display:flex;flex-wrap:wrap;gap:var(--cds-gap-lg);font-size:var(--cds-font-size-caption);color:var(--color-fg-muted);margin-bottom:var(--cds-gap-sm)}.pm-hist-resumo b{color:var(--color-fg);font-variant-numeric:tabular-nums}';
    document.head.appendChild(st);
    card = el('section', 'pm-card'); card.id = 'historico-produto'; card.hidden = true; card.setAttribute('data-source', 'historico_produtos');
    const head = el('div', 'pm-card-head'); const tt = el('div'); tt.append(el('h2', '', 'Histórico'), el('p', 'pm-note', 'GMV sem frete (barras) e ticket médio por peça (linha) de cada mês; o mês atual vai até ontem. Clique em outra linha da tabela para trocar, ou em Fechar.'));
    const fechar = el('button', 'pm-btn', 'Fechar'); fechar.type = 'button';
    fechar.style.cssText = 'font:inherit;font-size:var(--cds-font-size-caption);background:var(--color-panel);color:var(--color-fg);border:1px solid var(--color-border-line);border-radius:var(--cds-radius);padding:var(--cds-pad-xs) var(--cds-pad-sm);cursor:pointer';
    fechar.addEventListener('click', () => { aberto = null; card.hidden = true; marca(); });
    head.append(tt, fechar);
    card.append(head, el('div', 'pm-hist-resumo'), el('div', 'pm-legend'), el('div', 'pm-chart'));
    const det = document.getElementById('detalhe'); det.parentNode.insertBefore(card, det.nextSibling);
    return card;
  }
  function marca() { document.querySelectorAll('#tabela tbody tr').forEach((tr) => tr.classList.toggle('pm-sel', !!aberto && tr.getAttribute('data-key') === aberto.key)); }

  function desenha() {
    if (!aberto) return;
    const c = garanteCard(); c.hidden = false; marca();
    const rows = fonte();
    const box = c.querySelector('.pm-chart'), resumo = c.querySelector('.pm-hist-resumo'), leg = c.querySelector('.pm-legend');
    c.querySelector('h2').textContent = 'Histórico: ' + aberto.nome;
    if (!Array.isArray(rows)) {
      box.replaceChildren(el('p', 'pm-note', rows === 'error' ? 'Não foi possível carregar o histórico.' : 'Carregando o histórico…')); resumo.replaceChildren(); leg.replaceChildren();
      if (rows !== 'error' && tentativas++ < 60) setTimeout(desenha, 500);
      return;
    }
    const d = aberto.key.split('|')[0];
    const por = new Map();
    for (const r of rows) { if (idDe(r, d) !== aberto.key) continue; const a = por.get(r.month) || { gmv: 0, pecas: 0 }; a.gmv += r.gmv; a.pecas += r.net_items_sold; por.set(r.month, a); }
    const ks = [...por.keys()].sort();
    if (!ks.length) { box.replaceChildren(el('p', 'pm-note', 'Sem vendas registradas para esta linha.')); resumo.replaceChildren(); leg.replaceChildren(); return; }
    const meses = []; for (let k = ks[0]; k <= ks[ks.length - 1]; k = addMes(k, 1)) meses.push(k);
    const data = meses.map((k) => { const a = por.get(k) || { gmv: 0, pecas: 0 }; return { k, gmv: a.gmv, pecas: a.pecas, ticket: a.pecas > 0 ? a.gmv / a.pecas : null }; });
    const tg = data.reduce((a, b) => a + b.gmv, 0), tp = data.reduce((a, b) => a + b.pecas, 0);
    const best = data.reduce((a, b) => (b.gmv > a.gmv ? b : a), data[0]);
    resumo.replaceChildren();
    for (const [t, v] of [['GMV total', brl.format(tg)], ['Peças', int.format(tp)], ['Ticket médio', tp > 0 ? brl2.format(tg / tp) : '—'], ['Melhor mês', nomeMes(best.k) + ' · ' + brl.format(best.gmv)]]) { const s = el('span', '', t + ': '); s.appendChild(el('b', '', v)); resumo.appendChild(s); }
    const cor = (window.dash && dash.colors && dash.colors[0]) || 'var(--serie-1)', cor2 = 'var(--color-warn)';
    leg.replaceChildren();
    for (const [c2, t, linha] of [[cor, 'GMV sem frete'], [cor2, 'Ticket médio por peça', true]]) { const s = el('span'); const i = el('i'); i.style.background = c2; if (linha) { i.style.height = '3px'; i.style.verticalAlign = '3px'; } s.append(i, t); leg.appendChild(s); }
    box.replaceChildren();
    const W = Math.max(300, box.clientWidth || c.clientWidth - 32), H = 260, mt = 14, mb = 26, ml = 56, mr = 56;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'GMV e ticket médio por mês');
    const x = d3.scaleBand(meses, [ml, W - mr]).paddingInner(0.2).paddingOuter(0.05);
    const y = d3.scaleLinear([0, (d3.max(data, (v) => v.gmv) || 1) * 1.08], [H - mb, mt]).nice();
    const tks = data.filter((v) => v.ticket != null).map((v) => v.ticket);
    const y2 = d3.scaleLinear([0, (d3.max(tks) || 1) * 1.15], [H - mb, mt]).nice();
    const fmtK = (v) => v >= 1000 ? 'R$ ' + int.format(v / 1000) + ' mil' : 'R$ ' + int.format(v);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', ml).attr('x2', W - mr).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', 'var(--cds-chart-grid, var(--color-border-line))');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', ml - 6).attr('y', (v) => y(v) + 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').style('font-size', '0.68rem').text(fmtK);
    svg.append('g').selectAll('text').data(y2.ticks(4)).join('text').attr('x', W - mr + 6).attr('y', (v) => y2(v) + 4).attr('fill', cor2).style('font-size', '0.68rem').text((v) => 'R$ ' + int.format(v));
    svg.append('g').selectAll('rect').data(data).join('rect').attr('x', (v) => x(v.k)).attr('width', x.bandwidth()).attr('y', (v) => y(Math.max(0, v.gmv))).attr('height', (v) => Math.max(0, y(0) - y(Math.max(0, v.gmv)))).attr('rx', 2).attr('fill', cor);
    const linha = d3.line().defined((v) => v.ticket != null).x((v) => x(v.k) + x.bandwidth() / 2).y((v) => y2(v.ticket));
    svg.append('path').datum(data).attr('d', linha).attr('fill', 'none').attr('stroke', cor2).attr('stroke-width', 2);
    svg.append('g').selectAll('circle').data(data.filter((v) => v.ticket != null)).join('circle').attr('cx', (v) => x(v.k) + x.bandwidth() / 2).attr('cy', (v) => y2(v.ticket)).attr('r', 2.5).attr('fill', cor2);
    const passo = Math.max(1, Math.ceil(meses.length / Math.max(4, Math.floor((W - ml - mr) / 52))));
    svg.append('g').selectAll('text').data(data).join('text').attr('x', (v) => x(v.k) + x.bandwidth() / 2).attr('y', H - mb + 16).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').style('font-size', '0.68rem').text((v, i) => (i % passo === 0 || i === data.length - 1) ? nomeMes(v.k) : '');
    const tip = el('div', 'pm-tip'); tip.hidden = true; box.style.position = 'relative'; box.appendChild(tip);
    svg.append('g').selectAll('rect').data(data).join('rect').attr('x', (v) => x(v.k) - x.step() * 0.1).attr('width', x.step()).attr('y', mt).attr('height', H - mb - mt).attr('fill', 'transparent')
      .on('mousemove', (ev, v) => {
        tip.replaceChildren(el('div', 'pm-tip-h', nomeMes(v.k)), el('div', '', 'GMV: ' + brl2.format(v.gmv)), el('div', '', 'Peças: ' + int.format(v.pecas)), el('div', '', 'Ticket médio: ' + (v.ticket == null ? '—' : brl2.format(v.ticket))));
        tip.hidden = false; const [mx, my] = d3.pointer(ev, box);
        tip.style.left = Math.max(0, Math.min(box.clientWidth - tip.offsetWidth, mx + 12)) + 'px'; tip.style.top = Math.max(0, my - tip.offsetHeight - 8) + 'px';
      }).on('mouseleave', () => { tip.hidden = true; });
  }

  window.PM_HIST = { fonte, idDe };
  document.addEventListener('click', (ev) => {
    const tr = ev.target.closest && ev.target.closest('#tabela tbody tr[data-key]');
    if (!tr) return;
    const key = tr.getAttribute('data-key');
    if (!key || key === 'total' || !key.includes('|')) return;
    if (aberto && aberto.key === key) { aberto = null; if (card) card.hidden = true; marca(); return; }
    aberto = { key, nome: key.split('|').slice(1).join('|') };
    tentativas = 0; desenha();
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  new MutationObserver(marca).observe(document.getElementById('tabela') || document.body, { childList: true, subtree: true });
  let larg = 0; window.addEventListener('resize', () => { if (card && !card.hidden && Math.abs(card.clientWidth - larg) > 40) { larg = card.clientWidth; desenha(); } });
})();
