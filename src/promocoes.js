// Aba "Relatórios de promoção": compara os períodos de promoção (venda, margem, tráfego, conversão),
// lista os produtos destaque e os fracos em venda e giro e escreve o diagnóstico com plano de ação por regras fixas.
// Recebe os dados por PromoAba.define(D): { referencia, loja, sessoes, produtos, estoque: { 'AAAA-MM-DD': [...] } }.
// Os períodos vêm de src/promocoes.json (inserido no lugar do marcador abaixo na montagem da página).
(function () {
  const CFG = /*PROMO_CFG*/null;
  if (!CFG) return;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct0 = (v) => v == null || !isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }).format(v);
  const pct1 = (v) => v == null || !isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  const pct2 = (v) => v == null || !isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const vr = (v) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + pct0(Math.abs(v));
  const pp = (v) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + n1.format(Math.abs(v * 100)) + ' p.p.';
  const dataBR = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const anoAntes = (iso) => (+iso.slice(0, 4) - 1) + iso.slice(4);
  const dias = (a, b) => { const out = []; for (let d = a; d <= b; d = addDias(d, 1)) out.push(d); return out; };
  const curto = (s, n = 44) => { s = String(s || '').replace(/ Infantil para Colorir| para Colorir|\s*\+\s*0?6 canetinhas|\s*\+ canetinhas/gi, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const NAO_PRODUTO = /embalagem|envelope|sacola/i;
  const CORES = ['#3b6fd8', '#d9822b', '#2f9e6e', '#a35ec9', '#c94f5e', '#5aa6b8'];
  const lista = (arr, f, n = 3) => arr.slice(0, n).map(f).join('; ');

  let D = null, R = null;
  const st = { m: 'gmv', p: null };
  const guarda = { le: (k, v) => { try { const x = localStorage.getItem('pm_promo_' + k); return x == null ? v : x; } catch (e) { return v; } }, grava: (k, v) => { try { localStorage.setItem('pm_promo_' + k, v); } catch (e) { /* sem armazenamento */ } } };
  st.m = guarda.le('m', 'gmv');

  // ---------- cálculo ----------
  const num = (v) => (v == null || v === '' ? 0 : +v || 0);
  function somaDias(mapa, ds, campos) { const s = Object.fromEntries(campos.map((c) => [c, 0])); let n = 0; for (const d of ds) { const r = mapa.get(d); if (!r) continue; n++; for (const c of campos) s[c] += num(r[c]); } s._dias = n; return s; }
  const C_LOJA = ['orders', 'net_items_sold', 'gross_sales', 'discounts', 'sales_reversals', 'net_sales', 'shipping_charges', 'cost_of_goods_sold', 'gross_profit'];
  const C_SES = ['sessions', 'sessions_with_cart_additions', 'sessions_that_reached_checkout', 'sessions_that_completed_checkout'];

  function metricas(ds, loja, ses) {
    const l = somaDias(loja, ds, C_LOJA), s = somaDias(ses, ds, C_SES), n = ds.length;
    const bruto = l.gross_sales, desc = -l.discounts, frete = l.shipping_charges;
    const m = {
      dias: n, pedidos: l.orders, pecas: l.net_items_sold, bruto, desconto: desc, frete, receita: l.net_sales, lucro: l.gross_profit, cmv: l.cost_of_goods_sold,
      gmv: bruto - desc + frete, sessoes: s.sessions, carrinho: s.sessions_with_cart_additions, checkout: s.sessions_that_reached_checkout, compras: s.sessions_that_completed_checkout, temSessoes: s._dias > 0,
    };
    Object.assign(m, {
      pedidos_d: m.pedidos / n, pecas_d: m.pecas / n, gmv_d: m.gmv / n, receita_d: m.receita / n, lucro_d: m.lucro / n, sessoes_d: m.sessoes / n,
      margem: m.receita ? m.lucro / m.receita : null, desc_pct: bruto ? desc / bruto : null, preco_peca: m.pecas ? (bruto - desc) / m.pecas : null,
      ticket: m.pedidos ? m.gmv / m.pedidos : null, pecas_pedido: m.pedidos ? m.pecas / m.pedidos : null, frete_pedido: m.pedidos ? frete / m.pedidos : null,
      carrinho_pct: m.sessoes ? m.carrinho / m.sessoes : null, conv: m.sessoes ? m.compras / m.sessoes : null, fecha_checkout: m.checkout ? m.compras / m.checkout : null,
    });
    return m;
  }

  function prodsDoPeriodo(P) {
    const acc = new Map();
    for (const r of D.produtos) {
      const d = String(r.day).slice(0, 10); if (d < P.ini || d > P.fim) continue;
      const k = String(r.product_title || '').replace(/\s+/g, ' ').trim(); if (!k) continue;
      let a = acc.get(k); if (!a) { a = { nome: k, pecas: 0, bruto: 0, desconto: 0, receita: 0, lucro: 0, cmv: 0, semCusto: 0 }; acc.set(k, a); }
      a.pecas += num(r.net_items_sold); a.bruto += num(r.gross_sales); a.desconto += -num(r.discounts); a.receita += num(r.net_sales); a.lucro += num(r.gross_profit); a.cmv += num(r.cost_of_goods_sold);
      if (!num(r.cost_of_goods_sold) && num(r.net_sales) > 0) a.semCusto += num(r.net_sales);
    }
    const estFim = estoqueEm(P.fim), estAnt = P.fimAnterior ? estoqueEm(P.fimAnterior) : null;
    const nomes = new Set([...acc.keys(), ...(estFim ? estFim.keys() : [])]);
    const out = [];
    for (const k of nomes) {
      const a = acc.get(k) || { nome: k, pecas: 0, bruto: 0, desconto: 0, receita: 0, lucro: 0, cmv: 0, semCusto: 0 };
      a.gmv = a.bruto - a.desconto;
      a.est = estFim ? (estFim.has(k) ? Math.max(0, estFim.get(k)) : 0) : null;
      a.estAnt = estAnt ? (estAnt.has(k) ? Math.max(0, estAnt.get(k)) : 0) : null;
      a.st = a.est != null && a.pecas + a.est > 0 ? Math.max(0, a.pecas) / (Math.max(0, a.pecas) + a.est) : null;
      a.preco = a.pecas > 0 ? a.gmv / a.pecas : null;
      a.margem = a.receita > 0 && a.cmv > 0 ? a.lucro / a.receita : null;
      a.custoUn = a.pecas > 0 && a.cmv > 0 ? a.cmv / a.pecas : null;
      a.descPct = a.bruto > 0 ? a.desconto / a.bruto : null;
      a.pecas_d = a.pecas / P.dias;
      a.ajuste = a.estAnt != null && a.est != null ? a.est - (a.estAnt - a.pecas) : null; // + entrada / − saída fora de venda
      a.produto = !NAO_PRODUTO.test(k);
      if (a.pecas > 0 || (a.est || 0) > 0) out.push(a);
    }
    return out;
  }
  let estCache = new Map();
  function estoqueEm(dia) {
    if (estCache.has(dia)) return estCache.get(dia);
    const rows = D.estoque && D.estoque[dia];
    let m = null;
    if (rows) { m = new Map(); for (const r of rows) { const k = String(r.product_title || '').replace(/\s+/g, ' ').trim(); m.set(k, (m.get(k) || 0) + Math.max(0, num(r.ending_inventory_units))); } }
    estCache.set(dia, m); return m;
  }

  function calcula() {
    estCache = new Map();
    const loja = new Map(D.loja.map((r) => [String(r.day).slice(0, 10), r]));
    const ses = new Map(D.sessoes.map((r) => [String(r.day).slice(0, 10), r]));
    const ref = D.referencia;
    const brutos = [{ ...CFG.referencia, base: true }, ...CFG.promocoes];
    const per = [];
    brutos.forEach((p, i) => {
      if (p.ini > ref) return;
      const fim = p.fim > ref ? ref : p.fim;
      const ds = dias(p.ini, fim);
      const P = { ...p, fim, emAndamento: p.fim > ref, cor: p.base ? 'var(--cds-chart-muted)' : CORES[(i - 1) % CORES.length], dias: ds.length };
      P.m = metricas(ds, loja, ses);
      P.ly = metricas(ds.map(anoAntes), loja, ses);
      P.var_ly = P.ly.gmv_d ? P.m.gmv_d / P.ly.gmv_d - 1 : null;
      per.push(P);
    });
    per.forEach((P, i) => { P.fimAnterior = i > 0 ? per[i - 1].fim : null; P.prods = prodsDoPeriodo(P); });
    const base = per.find((p) => p.base) || null;
    const promos = per.filter((p) => !p.base);
    // por produto, comparação com a base (peças por dia e preço)
    if (base) { const bm = new Map(base.prods.map((a) => [a.nome, a])); for (const P of promos) for (const a of P.prods) { const b = bm.get(a.nome); a.base = b || null; a.var_pecas = b && b.pecas_d > 0 ? a.pecas_d / b.pecas_d - 1 : null; a.var_preco = b && b.preco && a.preco ? a.preco / b.preco - 1 : null; } }
    R = { per, base, promos, loja, ses };
    if (!st.p || !per.some((p) => p.id === st.p)) st.p = guarda.le('p', null);
    if (!st.p || !per.some((p) => p.id === st.p)) st.p = promos.length ? promos[promos.length - 1].id : per[0] && per[0].id;
  }

  // ---------- desenho ----------
  const aba = () => document.getElementById('aba-promocoes');
  function desenha() {
    if (!D || !aba() || aba().hidden) return;
    if (!R) calcula();
    if (!R.per.length) { document.getElementById('pr-janela').textContent = 'Nenhum período de promoção até a data dos dados.'; return; }
    document.getElementById('pr-janela').textContent = `Dados até ${D.referencia.split('-').reverse().join('/')}. ${R.promos.length} promoções comparadas com ${R.base ? 'o período antes delas (' + dataBR(R.base.ini) + ' a ' + dataBR(R.base.fim) + ')' : 'entre si'} e com as mesmas datas de 2025.`;
    drawPeriodos(); drawComparativo(); drawGrafico(); drawProdutos(); drawDiagnostico(); drawConclusao();
  }

  function drawPeriodos() {
    const box = document.getElementById('pr-periodos'); box.replaceChildren();
    for (const P of R.per) {
      const c = el('div', 'pm-pr-per'); const b = el('b'); const i = el('i'); i.style.background = P.cor; b.append(i, P.nome);
      c.append(b, el('div', 'pm-data', `${dataBR(P.ini)} a ${dataBR(P.fim)} · ${P.dias} dias${P.emAndamento ? ' · em andamento' : ''}`), el('div', '', P.mecanica || ''));
      box.appendChild(c);
    }
  }

  const LINHAS = [
    ['Venda'],
    ['GMV por dia', (m) => m.gmv_d, brl.format, 1],
    ['Pedidos por dia', (m) => m.pedidos_d, n1.format, 1],
    ['Peças por dia', (m) => m.pecas_d, n1.format, 1],
    ['Ticket médio (GMV ÷ pedidos)', (m) => m.ticket, brl.format, 1],
    ['Peças por pedido', (m) => m.pecas_pedido, n2.format, 1],
    ['Preço médio por peça (sem frete)', (m) => m.preco_peca, brl.format, 0],
    ['Margem'],
    ['Lucro bruto por dia', (m) => m.lucro_d, brl.format, 1],
    ['Margem bruta', (m) => m.margem, pct1, 1, 'pp'],
    ['Desconto (% da venda bruta)', (m) => m.desc_pct, pct1, -1, 'pp'],
    ['Frete cobrado por pedido', (m) => m.frete_pedido, brl2.format, 0],
    ['Site'],
    ['Sessões por dia', (m) => m.temSessoes ? m.sessoes_d : null, n0.format, 1],
    ['Adicionou ao carrinho', (m) => m.temSessoes ? m.carrinho_pct : null, pct1, 1, 'pp'],
    ['Conversão (comprou ÷ sessões)', (m) => m.temSessoes ? m.conv : null, pct2, 1, 'pp'],
    ['Checkout que virou compra', (m) => m.temSessoes ? m.fecha_checkout : null, pct0, 1, 'pp'],
    ['Contra as mesmas datas de 2025'],
    ['GMV por dia em 2025', (m, P) => P.ly.gmv_d, brl.format, 0, null, true],
    ['Variação do GMV por dia', (m, P) => P.var_ly, vr, 1, null, true],
    ['Conversão em 2025', (m, P) => P.ly.temSessoes ? P.ly.conv : null, pct2, 0, null, true],
  ];
  function drawComparativo() {
    const t = document.getElementById('pr-comparativo');
    const hr = t.querySelector('thead tr'); hr.replaceChildren(el('th', '', 'Indicador'));
    for (const P of R.per) { const th = el('th'); th.append(P.nome); th.appendChild(el('span', 'pm-sub', `${dataBR(P.ini)}–${dataBR(P.fim)} · ${P.dias} dias`)); if (P.base) th.classList.add('pm-ref'); hr.appendChild(th); }
    const tb = t.querySelector('tbody'); tb.replaceChildren();
    for (const [rot, f, fmt, melhor, tipoVar, semVar] of LINHAS) {
      const tr = el('tr');
      if (!f) { tr.className = 'pm-grupo'; const td = el('td', '', rot); td.colSpan = R.per.length + 1; tr.appendChild(td); tb.appendChild(tr); continue; }
      tr.appendChild(el('td', '', rot));
      const vals = R.per.map((P) => f(P.m, P));
      const vp = R.per.map((P, i) => (P.base ? null : vals[i])).filter((v) => v != null && isFinite(v));
      const mx = Math.max(...vp), mn = Math.min(...vp);
      R.per.forEach((P, i) => {
        const v = vals[i]; const td = el('td'); td.textContent = v == null || !isFinite(v) ? '—' : fmt(v);
        if (P.base) td.classList.add('pm-ref');
        else if (melhor && vp.length > 1 && v != null && mx !== mn) { if (v === (melhor > 0 ? mx : mn)) td.classList.add('pm-melhor'); else if (v === (melhor > 0 ? mn : mx)) td.classList.add('pm-pior'); }
        if (!P.base && !semVar && R.base) { const b = f(R.base.m, R.base); if (v != null && b != null && isFinite(v) && isFinite(b) && b !== 0) td.appendChild(el('span', 'pm-var', 'vs antes ' + (tipoVar === 'pp' ? pp(v - b) : vr(v / b - 1)))); }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
  }

  const MEDIDAS = { gmv: ['GMV', (r) => num(r.gross_sales) + num(r.discounts) + num(r.shipping_charges), brl.format], lucro: ['Lucro bruto', (r) => num(r.gross_profit), brl.format], pedidos: ['Pedidos', (r) => num(r.orders), n0.format], sessoes: ['Sessões', (r) => num(r.sessions), n0.format] };
  function drawGrafico() {
    document.querySelectorAll('#pr-seg-metrica button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.m)));
    const box = document.getElementById('pr-grafico'); box.replaceChildren();
    if (typeof d3 === 'undefined') return;
    const [nome, f, fmt] = MEDIDAS[st.m];
    const fonte = st.m === 'sessoes' ? R.ses : R.loja;
    const ini = R.per[0].ini, fim = R.per[R.per.length - 1].fim;
    const ds = dias(ini, fim);
    const serie = ds.map((d) => ({ d, v: fonte.has(d) ? f(fonte.get(d)) : 0, ly: fonte.has(anoAntes(d)) ? f(fonte.get(anoAntes(d))) : null }));
    const W = Math.max(320, box.clientWidth || 800), H = 260, m = { t: 16, r: 12, b: 26, l: 56 };
    const x = d3.scaleBand().domain(ds).range([m.l, W - m.r]).paddingInner(0);
    const ymax = d3.max(serie, (s) => Math.max(s.v, s.ly || 0)) || 1;
    const y = d3.scaleLinear().domain([0, ymax]).nice().range([H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', nome + ' por dia nos períodos de promoção');
    for (const P of R.per) {
      const x0 = x(P.ini), x1 = x(P.fim) + x.bandwidth();
      svg.append('rect').attr('x', x0).attr('y', m.t).attr('width', Math.max(0, x1 - x0)).attr('height', H - m.b - m.t).attr('fill', P.cor).attr('opacity', P.base ? 0.12 : 0.1);
      svg.append('text').attr('x', x0 + 4).attr('y', m.t + 10).attr('font-size', 10).attr('fill', 'var(--color-fg-muted)').text(P.nome.length > 18 && (x1 - x0) < 120 ? P.nome.slice(0, 16) + '…' : P.nome);
    }
    const yAx = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat((v) => st.m === 'gmv' || st.m === 'lucro' ? 'R$ ' + n0.format(v) : n0.format(v)));
    yAx.selectAll('line').attr('stroke', 'var(--cds-chart-grid)'); yAx.select('.domain').remove(); yAx.selectAll('text').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10);
    const semanas = ds.filter((d, i) => i % 7 === 0);
    const xAx = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(semanas).tickFormat(dataBR).tickSize(3));
    xAx.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); xAx.selectAll('text').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10);
    const cx = (d) => x(d) + x.bandwidth() / 2;
    const linha = d3.line().defined((s) => s.ly != null).x((s) => cx(s.d)).y((s) => y(s.ly));
    svg.append('path').datum(serie).attr('d', linha).attr('fill', 'none').attr('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
    svg.append('path').datum(serie).attr('d', d3.line().x((s) => cx(s.d)).y((s) => y(s.v))).attr('fill', 'none').attr('stroke', 'var(--serie-1)').attr('stroke-width', 2);
    const tip = el('div', 'pm-tip'); tip.hidden = true; box.style.position = 'relative'; box.appendChild(tip);
    const guia = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.b - m.t).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); const i = Math.max(0, Math.min(ds.length - 1, Math.floor((mx - m.l) / x.step()))); const s = serie[i];
        guia.attr('x1', cx(s.d)).attr('x2', cx(s.d)).attr('opacity', 1);
        const P = R.per.find((p) => s.d >= p.ini && s.d <= p.fim);
        tip.replaceChildren(el('div', '', `${s.d.split('-').reverse().join('/')}${P ? ' · ' + P.nome : ''}`), el('div', '', `${nome}: ${fmt(s.v)}`), el('div', '', `Mesmo dia de 2025: ${s.ly == null ? '—' : fmt(s.ly)}`));
        const [px, py] = d3.pointer(ev, box); tip.hidden = false; tip.style.left = Math.max(0, Math.min(box.clientWidth - tip.offsetWidth, px + 12)) + 'px'; tip.style.top = Math.max(0, py - tip.offsetHeight - 8) + 'px';
      })
      .on('mouseleave', () => { tip.hidden = true; guia.attr('opacity', 0); });
    const leg = document.getElementById('pr-legenda'); leg.replaceChildren();
    for (const [txt, cor, tr] of [[nome + ' em 2026', 'var(--serie-1)', false], ['Mesmo dia de 2025', 'var(--cds-chart-muted)', true]]) { const s = el('span'); const i = el('i'); i.style.cssText = `display:inline-block;width:14px;height:0;border-top:2px ${tr ? 'dashed' : 'solid'} ${cor};margin-right:6px;vertical-align:middle`; s.append(i, txt); s.style.marginRight = '14px'; leg.appendChild(s); }
  }

  // ---------- produtos ----------
  function leituraProduto(a, P, tipo) {
    const t = [];
    if (tipo === 'top' || tipo === 'giro') {
      if (a.est != null && a.est <= 5 && a.pecas > 0) t.push('Terminou o período quase sem estoque: a venda pode ter sido limitada');
      if (a.var_pecas != null && a.var_pecas >= 0.5) t.push(`Vendeu ${vr(a.var_pecas)} por dia contra antes: respondeu à promoção`);
      else if (a.var_preco != null && a.var_preco <= -0.15 && (a.var_pecas == null || a.var_pecas < 0.2)) t.push(`Preço por peça ${vr(a.var_preco)} e volume quase igual: desconto sem ganho de volume`);
      if (a.base == null || !a.base.pecas) t.push('Não vendia antes das promoções');
    } else {
      if (a.pecas <= 0) t.push('Nenhuma venda com estoque disponível');
      if (a.descPct != null && a.descPct < 0.03 && (a.var_preco == null || a.var_preco > -0.05)) t.push('Sem desconto relevante no período');
      if (a.var_preco != null && a.var_preco <= -0.15) t.push(`Mesmo com preço ${vr(a.var_preco)}, não ganhou volume`);
      if (a.st != null && a.est >= 100) t.push(`${n0.format(a.est)} peças paradas`);
      if (a.base && a.base.pecas_d > 0 && a.var_pecas != null && a.var_pecas <= -0.3) t.push(`Vendeu ${vr(a.var_pecas)} por dia contra antes`);
    }
    return t.join('. ') + (t.length ? '.' : '');
  }
  function tabelaProdutos(titulo, nota, linhas, cols) {
    const w = el('div'); w.append(el('h3', '', titulo), el('p', 'pm-note', nota));
    const box = el('div', 'pm-tablebox'); box.style.maxHeight = 'none'; const t = el('table', 'pm-table'); const th = el('tr');
    for (const c of cols) th.appendChild(el('th', c.cls || '', c.r));
    const thead = el('thead'); thead.appendChild(th); const tb = el('tbody');
    if (!linhas.length) { const tr = el('tr'); const td = el('td', 'pm-txt', 'Nenhum produto neste critério.'); td.colSpan = cols.length; tr.appendChild(td); tb.appendChild(tr); }
    for (const a of linhas) { const tr = el('tr'); for (const c of cols) { const td = el('td', c.cls || ''); td.textContent = c.f(a); tr.appendChild(td); } tb.appendChild(tr); }
    t.append(thead, tb); box.appendChild(t); w.appendChild(box); return w;
  }
  function drawProdutos() {
    const seg = document.getElementById('pr-seg-periodo'); seg.replaceChildren();
    for (const P of R.per) { const b = el('button', '', P.nome); b.type = 'button'; b.dataset.p = P.id; b.setAttribute('aria-pressed', String(P.id === st.p)); seg.appendChild(b); }
    const P = R.per.find((p) => p.id === st.p) || R.per[R.per.length - 1];
    const prods = P.prods.filter((a) => a.produto);
    const T = P.prods.reduce((s, a) => s + Math.max(0, a.gmv), 0) || 1;
    const temEst = P.prods.some((a) => a.est != null);
    document.getElementById('pr-produtos-nota').textContent = `${P.nome}, de ${dataBR(P.ini)} a ${dataBR(P.fim)}. Estoque do último dia do período${temEst ? '' : ' (sem dado de estoque para esta data)'}. Embalagens e envelopes ficam fora das listas.`;
    const box = document.getElementById('pr-produtos'); box.replaceChildren();
    const nomeC = { r: 'Produto', f: (a) => curto(a.nome), cls: 'pm-txt' };
    const vsAntes = { r: 'Peças/dia vs antes', f: (a) => a.var_pecas == null ? (a.base && a.base.pecas ? '—' : 'novo') : vr(a.var_pecas) };
    const leit = (tipo) => ({ r: 'Leitura', f: (a) => leituraProduto(a, P, tipo) || '—', cls: 'pm-pr-leitura' });
    const top = prods.filter((a) => a.gmv > 0).sort((x, y) => y.gmv - x.gmv).slice(0, 8);
    const giro = prods.filter((a) => a.st != null && a.pecas >= 5).sort((x, y) => y.st - x.st).slice(0, 8);
    const menos = prods.filter((a) => (a.est || 0) >= 30 && (a.pecas > 0 || (a.base && a.base.pecas > 0))).sort((x, y) => x.pecas_d - y.pecas_d || y.est - x.est).slice(0, 8);
    const menosGiro = prods.filter((a) => a.st != null && (a.est || 0) >= 50).sort((x, y) => x.st - y.st || y.est - x.est).slice(0, 8);
    box.append(
      tabelaProdutos('Mais vendidos', 'Os 8 maiores em GMV no período.', top, [nomeC, { r: 'Peças', f: (a) => n0.format(a.pecas) }, { r: 'GMV', f: (a) => brl.format(a.gmv) }, { r: '% do GMV', f: (a) => pct0(a.gmv / T) }, { r: 'Preço/peça', f: (a) => a.preco ? brl.format(a.preco) : '—' }, { r: 'Margem', f: (a) => pct0(a.margem) }, ...(P.base ? [] : [vsAntes]), leit('top')]),
      tabelaProdutos('Maior giro', 'Maior sell-through entre os que venderam 5 peças ou mais.', giro, [nomeC, { r: 'Peças', f: (a) => n0.format(a.pecas) }, { r: 'Estoque no fim', f: (a) => n0.format(a.est) }, { r: 'Sell-through', f: (a) => pct0(a.st) }, ...(P.base ? [] : [vsAntes]), leit('giro')]),
      tabelaProdutos('Venderam menos', 'Menor venda por dia entre os que tinham 30 peças ou mais em estoque e venderam neste período ou antes das promoções. Os parados de vez estão em "Giraram menos".', menos, [nomeC, { r: 'Peças', f: (a) => n0.format(a.pecas) }, { r: 'Estoque no fim', f: (a) => n0.format(a.est) }, { r: 'Preço/peça', f: (a) => a.preco ? brl.format(a.preco) : '—' }, ...(P.base ? [] : [vsAntes]), leit('baixo')]),
      tabelaProdutos('Giraram menos', 'Menor sell-through entre os que tinham 50 peças ou mais em estoque.', menosGiro, [nomeC, { r: 'Peças', f: (a) => n0.format(a.pecas) }, { r: 'Estoque no fim', f: (a) => n0.format(a.est) }, { r: 'Sell-through', f: (a) => pct0(a.st) }, leit('baixo')]),
    );
  }

  // ---------- diagnóstico ----------
  function alertasDados(P) {
    const al = [];
    // ajuste de estoque fora de venda entre o fim do período anterior e o fim deste
    const aj = P.prods.filter((a) => a.ajuste != null && Math.abs(a.ajuste) >= 20 && a.estAnt > 0 && Math.abs(a.ajuste) / a.estAnt >= 0.3);
    const ajTot = aj.reduce((s, a) => s + a.ajuste, 0);
    if (aj.length >= 3) al.push(`O estoque de ${aj.length} produtos mudou ${ajTot < 0 ? 'para baixo' : 'para cima'} sem venda correspondente entre ${dataBR(P.fimAnterior)} e ${dataBR(P.fim)} (${n0.format(Math.abs(ajTot))} peças, ex.: ${lista(aj.sort((x, y) => Math.abs(y.ajuste) - Math.abs(x.ajuste)), (a) => curto(a.nome, 28), 2)}). Foi ajuste de estoque ou entrada de produção: compare o giro antes e depois dessa data com cuidado.`);
    // custo cadastrado mudou
    const ant = R.per[R.per.indexOf(P) - 1];
    if (ant) {
      const am = new Map(ant.prods.map((a) => [a.nome, a]));
      const mud = P.prods.filter((a) => { const b = am.get(a.nome); return a.custoUn && b && b.custoUn && a.pecas >= 3 && b.pecas >= 3 && Math.abs(a.custoUn / b.custoUn - 1) >= 0.1; });
      const peso = mud.reduce((s, a) => s + a.gmv, 0) / (P.prods.reduce((s, a) => s + Math.max(0, a.gmv), 0) || 1);
      if (mud.length && peso >= 0.2) {
        P.custoMudou = true;
        const ex = mud.sort((x, y) => y.gmv - x.gmv)[0], b = am.get(ex.nome);
        al.push(`O custo por peça cadastrado no Shopify mudou em produtos que somam ${pct0(peso)} do GMV (ex.: ${curto(ex.nome, 30)}, de ${brl2.format(b.custoUn)} para ${brl2.format(ex.custoUn)}). Parte da variação da margem vem dessa mudança de cadastro, não da promoção.`);
      }
    }
    const semCusto = P.prods.reduce((s, a) => s + a.semCusto, 0), rec = P.m.receita || 1;
    if (semCusto / rec >= 0.05) al.push(`${pct0(semCusto / rec)} da receita do período veio de produtos sem custo cadastrado, o que infla a margem.`);
    return al;
  }

  function diagnostico(P) {
    const B = R.base, M = [], A = [], C = [], acoes = [];
    const m = P.m;
    if (!B) return { M, A, C, acoes };
    const b = B.m;
    const r = (a, c) => (c ? a / c - 1 : null);
    const dGmv = r(m.gmv_d, b.gmv_d), dLuc = r(m.lucro_d, b.lucro_d), dSes = r(m.sessoes_d, b.sessoes_d), dConv = r(m.conv, b.conv), dTkt = r(m.ticket, b.ticket);
    // decomposição do GMV/dia: sessões × conversão × ticket (aprox. pedidos ≈ compras)
    if (m.temSessoes && b.temSessoes && b.sessoes_d && b.conv && b.ticket) {
      C.push(`GMV por dia ${vr(dGmv)} contra antes das promoções: sessões ${vr(dSes)}, conversão ${vr(dConv)} (${pct2(b.conv)} → ${pct2(m.conv)}) e ticket ${vr(dTkt)} (${brl.format(b.ticket)} → ${brl.format(m.ticket)}).`);
    }
    // resultado
    if (dLuc != null && dLuc >= 0.3) M.push({ t: 'Lucro bruto por dia subiu.', d: `${brl.format(m.lucro_d)} por dia, ${vr(dLuc)} contra antes (${brl.format(b.lucro_d)})${P.custoMudou ? '; parte disso vem da mudança do custo cadastrado (veja o aviso acima)' : ''}.` });
    else if (dLuc != null && dLuc < 0.1) A.push({ t: 'A promoção quase não aumentou o lucro.', d: `Lucro bruto de ${brl.format(m.lucro_d)} por dia, ${vr(dLuc)} contra antes: o desconto custou e não trouxe volume suficiente.` });
    // tráfego e conversão
    if (dSes != null && dSes >= 0.5 && dConv != null && dConv <= -0.25) {
      A.push({ t: 'Mais visitas, mas visitas menos dispostas a comprar.', d: `As sessões subiram ${vr(dSes)} e a conversão caiu ${vr(dConv)}. A campanha atraiu tráfego mais frio do que o normal.` });
      acoes.push('Revisar a segmentação da mídia desta mecânica: priorizar público que já visitou o site, clientes da base (e-mail, WhatsApp) e remarketing, em vez de público frio.');
    } else if (dConv != null && dConv <= -0.25) {
      A.push({ t: 'Conversão caiu.', d: `${pct2(b.conv)} antes contra ${pct2(m.conv)} na promoção, sem aumento grande de visitas.` });
      acoes.push('Deixar a oferta clara na vitrine e na página de produto (selo com o desconto, preço "de/por", regra visível no topo do site).');
    } else if (dConv != null && dConv >= 0.15) M.push({ t: 'Converteu melhor.', d: `Conversão de ${pct2(m.conv)}, contra ${pct2(b.conv)} antes.` });
    if (m.carrinho_pct != null && b.carrinho_pct && m.carrinho_pct / b.carrinho_pct - 1 <= -0.2) C.push(`Menos visitantes adicionaram ao carrinho (${pct1(b.carrinho_pct)} → ${pct1(m.carrinho_pct)}): a perda acontece na vitrine e na página do produto, antes do checkout.`);
    if (m.fecha_checkout != null && b.fecha_checkout && m.fecha_checkout / b.fecha_checkout - 1 <= -0.2) { C.push(`Menos checkouts viraram compra (${pct0(b.fecha_checkout)} → ${pct0(m.fecha_checkout)}): olhar frete e formas de pagamento no checkout.`); acoes.push('Verificar o valor do frete e o prazo exibidos no checkout e testar cupom de recuperação de carrinho abandonado.'); }
    // carrinho / ticket
    if (m.pecas_pedido != null && b.pecas_pedido && m.pecas_pedido - b.pecas_pedido >= 0.25) M.push({ t: 'Aumentou o carrinho.', d: `${n2.format(m.pecas_pedido)} peças por pedido, contra ${n2.format(b.pecas_pedido)} antes.` });
    if (dTkt != null && dTkt >= 0.1) M.push({ t: 'Ticket médio maior.', d: `${brl.format(m.ticket)} por pedido (${vr(dTkt)}).` });
    else if (dTkt != null && dTkt <= -0.1) A.push({ t: 'Ticket médio menor.', d: `${brl.format(m.ticket)} por pedido, ${vr(dTkt)} contra antes.` });
    // margem e desconto
    const dMarg = m.margem != null && b.margem != null ? m.margem - b.margem : null;
    const dPreco = r(m.preco_peca, b.preco_peca);
    if (dMarg != null && dMarg <= -0.03 && (dGmv == null || dGmv < 0.2)) A.push({ t: 'Desconto comeu margem sem trazer volume.', d: `Margem ${pp(dMarg)} (${pct1(m.margem)}) e GMV por dia só ${vr(dGmv)}.` });
    else if (dMarg != null && dMarg <= -0.03) C.push(`A margem caiu ${pp(dMarg)} pelo desconto, compensada pelo volume (GMV por dia ${vr(dGmv)}).`);
    else if (dMarg != null && dMarg >= 0.03) C.push(`A margem subiu ${pp(dMarg)} (${pct1(m.margem)}). Confira os avisos sobre custo cadastrado antes de atribuir isso à promoção.`);
    if (m.desc_pct != null && m.desc_pct < 0.03 && dPreco != null && dPreco <= -0.15) C.push(`O desconto foi dado direto no preço: quase não aparece como desconto (${pct1(m.desc_pct)}), mas o preço médio por peça caiu ${vr(dPreco)} (${brl.format(b.preco_peca)} → ${brl.format(m.preco_peca)}).`);
    // por mecânica
    if (P.tipo === 'remarcacao') {
      if (dPreco != null && dPreco <= -0.15 && (dLuc == null || dLuc < 0.2)) { A.push({ t: 'Remarcação ampla vendeu mais barato sem multiplicar o volume.', d: `Peças por dia ${vr(r(m.pecas_d, b.pecas_d))}, preço por peça ${vr(dPreco)}.` }); acoes.push('Usar remarcação forte só para queimar estoque parado (lista "Giraram menos"), não na coleção toda.'); }
      else if (dLuc != null && dLuc >= 0.3) acoes.push('Repetir a remarcação nos produtos que mais responderam (lista "Mais vendidos") e manter o resto a preço cheio.');
    }
    if (P.tipo === 'pontual') {
      if (dGmv != null && dGmv < 0.5) { A.push({ t: 'Descontos pontuais não criaram urgência.', d: `GMV por dia ${vr(dGmv)} contra antes, com conversão de ${pct2(m.conv)}.` }); acoes.push('Concentrar a data dupla em 1 ou 2 dias com contagem regressiva, e-mail e WhatsApp para a base, em vez de vários dias de desconto morno.'); }
    }
    if (P.tipo === 'progressivo') {
      if (m.pecas_pedido != null && b.pecas_pedido && m.pecas_pedido > b.pecas_pedido) { M.push({ t: 'A mecânica progressiva funcionou.', d: `Levou o cliente a comprar mais peças (${n2.format(m.pecas_pedido)} por pedido) e subiu o ticket para ${brl.format(m.ticket)}.` }); acoes.push('Repetir o desconto progressivo na Black Friday e no Natal, com kits prontos de 2 e 3 peças na vitrine para facilitar o "leve mais".'); }
      if (m.desc_pct != null && m.desc_pct >= 0.15) C.push(`O desconto médio ficou em ${pct1(m.desc_pct)} da venda bruta: o degrau de 25% foi bastante usado.`);
    }
    if (P.tipo === 'frete' && P.limiteFrete) {
      if (m.ticket != null && m.ticket < P.limiteFrete) { A.push({ t: 'O mínimo do frete grátis ficou acima do ticket.', d: `Ticket médio de ${brl.format(m.ticket)}, abaixo dos ${brl.format(P.limiteFrete)} do frete grátis: a maioria dos pedidos não alcançou o benefício.` }); acoes.push(`Testar o frete grátis a partir de um valor perto do ticket (${brl.format(Math.round(m.ticket / 10) * 10 - 10)} a ${brl.format(Math.round(m.ticket / 10) * 10)}) ou na compra de 2 peças, com uma barra "faltam R$ X para o frete grátis" no carrinho.`); }
      if (m.frete_pedido != null && b.frete_pedido != null && m.frete_pedido >= b.frete_pedido * 0.9) C.push(`O frete cobrado por pedido não caiu (${brl2.format(b.frete_pedido)} → ${brl2.format(m.frete_pedido)}): sinal de que poucos pedidos usaram o frete grátis.`);
      else if (m.frete_pedido != null && b.frete_pedido) M.push({ t: 'O frete grátis foi usado.', d: `Frete cobrado por pedido caiu de ${brl2.format(b.frete_pedido)} para ${brl2.format(m.frete_pedido)}.` });
    }
    // ano anterior
    if (P.var_ly != null) {
      const t = `${vr(P.var_ly)} no GMV por dia contra as mesmas datas de 2025 (${brl.format(P.ly.gmv_d)} por dia)` + (P.ly.temSessoes && m.temSessoes ? `; sessões ${vr(r(m.sessoes_d, P.ly.sessoes_d))} e conversão ${pct2(P.ly.conv)} → ${pct2(m.conv)}.` : '.');
      if (P.var_ly <= -0.3) A.push({ t: 'Abaixo de 2025.', d: t }); else if (P.var_ly >= 0) M.push({ t: 'Acima de 2025.', d: t }); else C.push('Contra 2025: ' + t);
    }
    // produtos
    const prods = P.prods.filter((a) => a.produto);
    const rupt = prods.filter((a) => a.est != null && a.est <= 5 && a.pecas >= 5).sort((x, y) => y.gmv - x.gmv);
    if (rupt.length) { A.push({ t: 'Produtos que mais venderam terminaram sem estoque.', d: lista(rupt, (a) => `${curto(a.nome, 32)} (${n0.format(a.est)} no fim)`) + '.' }); acoes.push('Repor antes da próxima campanha os produtos que acabaram: ' + lista(rupt, (a) => curto(a.nome, 30)) + '.'); }
    const parados = prods.filter((a) => (a.est || 0) >= 100 && (a.st == null || a.st < 0.03)).sort((x, y) => y.est - x.est);
    if (parados.length) { A.push({ t: 'Estoque grande que não girou.', d: `${parados.length} produtos com 100 peças ou mais e sell-through abaixo de 3%: ${lista(parados, (a) => `${curto(a.nome, 30)} (${n0.format(a.est)})`)}.` }); acoes.push('Montar uma ação de queima só com os produtos parados (kit, leve 3 pague 2 ou brinde), separada da campanha principal.'); }
    const top = prods.filter((a) => a.gmv > 0).sort((x, y) => y.gmv - x.gmv).slice(0, 3);
    const T = P.prods.reduce((s, a) => s + Math.max(0, a.gmv), 0) || 1;
    if (top.length) M.push({ t: 'Carros-chefe da promoção.', d: lista(top, (a) => `${curto(a.nome, 32)} (${pct0(a.gmv / T)} do GMV)`) + '.' });
    return { M, A, C, acoes };
  }

  function lis(itens, vazio) { const ul = el('ul'); if (!itens.length) { ul.appendChild(el('li', 'pm-vazio', vazio)); return ul; } for (const it of itens) { const li = el('li'); if (typeof it === 'string') li.textContent = it; else { li.appendChild(el('b', '', it.t)); li.appendChild(document.createTextNode(' ' + it.d)); } ul.appendChild(li); } return ul; }
  function h3(txt, cor) { const h = el('h3'); if (cor) { const i = el('i'); i.style.background = cor; h.appendChild(i); } h.append(txt); return h; }

  function drawDiagnostico() {
    const P = R.per.find((p) => p.id === st.p) || R.per[R.per.length - 1];
    document.getElementById('pr-diag-titulo').textContent = 'Diagnóstico e plano de ação · ' + P.nome;
    document.getElementById('pr-diag-nota').textContent = P.base ? 'Este é o período de referência. Escolha uma promoção acima para ver o diagnóstico dela.' : `${P.mecanica || ''} Comparado com o período antes das promoções e com as mesmas datas de 2025. Leitura automática por regras fixas.`;
    const box = document.getElementById('pr-diagnostico'); box.replaceChildren();
    for (const a of alertasDados(P)) box.appendChild(el('p', 'pm-pr-alerta', '⚠ ' + a));
    if (P.base) return;
    const d = diagnostico(P);
    const g = el('div', 'pm-an-grid');
    const c1 = el('div'); c1.append(h3('Funcionou (manter)', 'var(--color-ok)'), lis(d.M, 'Nenhum ponto positivo forte neste período.'));
    const c2 = el('div'); c2.append(h3('Não funcionou (ajustar)', 'var(--color-warn)'), lis(d.A, 'Nenhum ponto de atenção relevante.'));
    g.append(c1, c2); box.appendChild(g);
    box.append(h3('Por que aconteceu'), lis(d.C, 'Sem causa destacada pelas regras.'));
    const ol = el('ol'); for (const a of [...new Set(d.acoes)]) ol.appendChild(el('li', '', a));
    box.append(h3('Plano de ação'), d.acoes.length ? ol : lis([], 'Manter a mecânica como está.'));
  }

  function drawConclusao() {
    const box = document.getElementById('pr-conclusao'); box.replaceChildren();
    const ps = R.promos; if (!ps.length) return;
    const B = R.base;
    const porLucro = ps.slice().sort((a, b) => b.m.lucro_d - a.m.lucro_d);
    const melhor = porLucro[0], pior = porLucro[porLucro.length - 1];
    const x = (P) => B && B.m.lucro_d ? ` (${n1.format(P.m.lucro_d / B.m.lucro_d)}× o período antes)` : '';
    let txt = `A promoção que mais deu resultado foi ${melhor.nome}: ${brl.format(melhor.m.lucro_d)} de lucro bruto e ${brl.format(melhor.m.gmv_d)} de GMV por dia${x(melhor)}.`;
    if (ps.length > 1) txt += ` A mais fraca foi ${pior.nome}, com ${brl.format(pior.m.lucro_d)} de lucro bruto por dia${x(pior)}.`;
    if (ps.some((P) => { alertasDados(P); return P.id === melhor.id && P.custoMudou; })) txt += ` Parte do lucro de ${melhor.nome} vem da redução do custo cadastrado no Shopify durante o período, não só da promoção.`;
    const comLy0 = ps.filter((P) => P.var_ly != null);
    const melhorLy = comLy0.slice().sort((a, b) => b.var_ly - a.var_ly)[0];
    if (melhorLy && comLy0.length > 1 && melhorLy.id !== melhor.id) txt += ` Comparando com as mesmas datas de 2025, o que tira o efeito da data comemorativa, a melhor foi ${melhorLy.nome} (${vr(melhorLy.var_ly)}, contra ${vr(Math.min(...comLy0.map((P) => P.var_ly)))} na pior).`;
    const porTicket = ps.slice().sort((a, b) => (b.m.ticket || 0) - (a.m.ticket || 0))[0];
    if (porTicket) txt += ` O maior ticket médio foi o de ${porTicket.nome} (${brl.format(porTicket.m.ticket)} por pedido${porTicket.m.pecas_pedido ? ', ' + n2.format(porTicket.m.pecas_pedido) + ' peças' : ''}).`;
    box.appendChild(el('p', 'pm-pr-conclusao', txt));
    const pontos = [];
    const comLy = ps.filter((P) => P.ly.temSessoes && P.m.temSessoes && P.ly.conv);
    const convPior = comLy.filter((P) => P.m.conv / P.ly.conv - 1 <= -0.3);
    if (comLy.length && convPior.length === comLy.length) pontos.push({ t: 'Conversão estrutural mais baixa que em 2025.', d: `Em todas as promoções a conversão ficou ${vr(convPior.reduce((s, P) => s + (P.m.conv / P.ly.conv - 1), 0) / convPior.length)} em média contra as mesmas datas de 2025. Não é a mecânica: vale revisar preço percebido, frete, velocidade e confiança do site e o público da mídia.` });
    const lyQueda = ps.filter((P) => P.var_ly != null && P.var_ly <= -0.4);
    if (lyQueda.length && lyQueda.length === ps.length) pontos.push({ t: 'Todas abaixo de 2025.', d: `GMV por dia entre ${vr(Math.max(...ps.map((P) => P.var_ly)))} e ${vr(Math.min(...ps.map((P) => P.var_ly)))} contra as mesmas datas do ano passado. A melhor no comparativo com 2025 foi ${ps.slice().sort((a, b) => b.var_ly - a.var_ly)[0].nome}.` });
    if (B) {
      const sesUp = ps.filter((P) => P.m.temSessoes && B.m.sessoes_d && P.m.sessoes_d / B.m.sessoes_d - 1 >= 0.5 && P.m.conv < B.m.conv * 0.8);
      if (sesUp.length >= 2) pontos.push({ t: 'Tráfego subiu, conversão caiu.', d: `Em ${sesUp.map((P) => P.nome).join(', ')}, as visitas pelo menos 50% acima de antes não viraram compra na mesma proporção.` });
    }
    const prox = [];
    const prog = ps.find((P) => P.tipo === 'progressivo');
    if (prog && B && prog.m.ticket >= B.m.ticket && prog.m.pecas_pedido >= B.m.pecas_pedido + 0.15) prox.push(`Para a Black Friday e o Natal, usar como base a mecânica progressiva (mais peças, mais desconto): na ${prog.nome} o ticket foi ${brl.format(prog.m.ticket)} com ${n2.format(prog.m.pecas_pedido)} peças por pedido, ${melhorLy && melhorLy.id === prog.id ? 'e foi a que menos caiu contra 2025' : 'sem precisar de desconto no preço da vitrine'}.`);
    const fr = ps.find((P) => P.tipo === 'frete' && P.limiteFrete && P.m.ticket < P.limiteFrete);
    if (fr) prox.push(`Frete grátis só funciona com o mínimo perto do ticket médio (${brl.format(fr.m.ticket)}); acima disso, comunicar "falta pouco" no carrinho.`);
    const rem = ps.find((P) => P.tipo === 'remarcacao');
    if (rem && rem.id !== melhor.id) prox.push('Remarcação ampla (até 50%) deve ficar restrita à queima de estoque parado.');
    if (convPior.length) prox.push('Atacar a conversão do site antes de aumentar a verba: oferta clara na vitrine, frete e prazo visíveis na página do produto, prova social e checkout mais simples.');
    const g = el('div', 'pm-an-grid');
    const c1 = el('div'); c1.append(h3('O que os números mostram'), lis(pontos, 'Sem padrão comum entre as promoções.'));
    const c2 = el('div'); const ol = el('ol'); for (const p of prox) ol.appendChild(el('li', '', p)); c2.append(h3('Para as próximas campanhas'), prox.length ? ol : lis([], 'Sem recomendação geral.'));
    g.append(c1, c2); box.appendChild(g);
  }

  // ---------- eventos ----------
  document.getElementById('pr-seg-metrica').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.m = b.dataset.m; guarda.grava('m', st.m); drawGrafico(); });
  document.getElementById('pr-seg-periodo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.p = b.dataset.p; guarda.grava('p', st.p); drawProdutos(); drawDiagnostico(); });
  document.getElementById('abas').addEventListener('click', () => setTimeout(() => { if (!D) carregaDoPainel(); desenha(); }, 0));
  let larg = 0; window.addEventListener('resize', () => { const w = aba() && aba().clientWidth; if (R && w && Math.abs(w - larg) > 40) { larg = w; drawGrafico(); } });

  // Painel do Claude: os dados vêm do arquivo "promocoes" (lista de linhas com o campo t = loja | ses | prod | est).
  function carregaDoPainel() {
    if (D || !window.dash || typeof dash.data !== 'function') return;
    const d = dash.data('promocoes');
    if (!d || d.status !== 'ok') { if (d && d.status === 'error' && aba() && !aba().hidden) document.getElementById('pr-janela').textContent = 'Não foi possível carregar os dados das promoções. Tente atualizar a página.'; return; }
    const rows = Array.isArray(d.data) ? d.data : (d.data && d.data.rows) || [];
    const X = { loja: [], sessoes: [], produtos: [], estoque: {}, referencia: null };
    for (const r of rows) {
      if (r.t === 'loja') X.loja.push(r); else if (r.t === 'ses') X.sessoes.push(r); else if (r.t === 'prod') X.produtos.push(r);
      else if (r.t === 'est') (X.estoque[r.fim] = X.estoque[r.fim] || []).push(r);
      else if (r.t === 'ref') X.referencia = r.referencia;
    }
    if (!X.referencia) X.referencia = X.loja.reduce((m, r) => (String(r.day) > m ? String(r.day).slice(0, 10) : m), '');
    window.PromoAba.define(X);
  }
  if (window.dash && typeof dash.onData === 'function') { try { dash.onData(() => { carregaDoPainel(); }); } catch (e) { /* sem onData */ } }

  window.PromoAba = {
    define(X) {
      if (!X) return;
      const abre = (c) => (Array.isArray(c) ? c : c && c.linhas ? c.linhas.map((l) => Object.fromEntries(c.campos.map((f, i) => [f, c.dic && /product_|^day$/.test(f) && typeof l[i] === 'number' && f !== 'day' ? c.dic[l[i]] : l[i]]))) : []);
      D = { referencia: X.referencia, loja: abre(X.loja), sessoes: abre(X.sessoes), produtos: abre(X.produtos), estoque: X.estoque || {} };
      R = null; desenha();
    },
    resultado() { if (!D) return null; if (!R) calcula(); return R; },
    desenha,
  };
})();
