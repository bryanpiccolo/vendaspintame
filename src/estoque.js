// Aba "Estoque": previsão de vendas, ruptura e compra sugerida. Recebe os dados por EstoqueAba.define(D) e usa Previsao (src/previsao.js).
(function () {
  const P = window.Previsao;
  const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const nomeMes = (k, o) => new Date(k.slice(0, 7) + '-15T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric', ...(o || {}) });
  const curto = (k) => nomeMes(k, { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/');
  const dataBR = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const dataCurta = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const guarda = { le(k, d) { try { const v = localStorage.getItem('pm-est-' + k); return v == null ? d : v; } catch (e) { return d; } }, grava(k, v) { try { localStorage.setItem('pm-est-' + k, v); } catch (e) { /* sem armazenamento */ } } };

  const st = { m: 'pecas', v: guarda.le('visao', 'produto_tamanho'), f: 'risco', q: '', sort: null, dir: 1, prazo: +guarda.le('prazo', 45), cobertura: +guarda.le('cobertura', 60) };
  let R = null, DADOS = null, ref = '', mesRef = '';
  const serieMensal = (m) => new Map(DADOS.mensal.map((r) => [String(r.month).slice(0, 7), m === 'pecas' ? (r.net_items_sold || 0) : (r.gross_sales || 0) + (r.discounts || 0) + (r.shipping_charges || 0)]));

  const pressed = (sel, attr, v) => document.querySelectorAll(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === v)));

  function calcula() { R = P.calcula(DADOS, { prazo: st.prazo, cobertura: st.cobertura }); }

  // ---------- status de cada peça ----------
  const diasAte = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(ref + 'T12:00:00Z')) / 86400000);
  function status(it) {
    const d6 = Object.values(it.prev_meses).reduce((a, b) => a + b, 0) + it.prev_resto_mes;
    if (it.share <= 0) return it.estoque > 0 ? 'parado' : null;
    if (it.estoque <= 0) return 'zerado';
    const dr = it.ruptura ? diasAte(it.ruptura) : Infinity;
    if (dr <= st.prazo) return 'urgente';
    if (it.comprar > 0) return 'comprar';
    if (it.estoque > d6 * 1.5) return 'excesso';
    return 'ok';
  }
  const STATUS = {
    zerado: { t: 'Sem estoque', c: 'var(--color-bad)', o: 0 },
    urgente: { t: 'Acaba antes da reposição', c: 'var(--color-bad)', o: 1 },
    comprar: { t: 'Comprar', c: 'var(--color-warn)', o: 2 },
    ok: { t: 'Ok', c: 'var(--color-ok)', o: 3 },
    excesso: { t: 'Excesso', c: 'var(--color-fg-muted)', o: 4 },
    parado: { t: 'Sem venda recente', c: 'var(--color-fg-muted)', o: 5 },
  };

  // ---------- indicadores ----------
  function drawCards() {
    const box = document.getElementById('est-cards'); box.replaceChildren();
    const L = R.loja, G = R.gmv, sP = serieMensal('pecas'), sG = serieMensal('gmv');
    const ly = P.addMes(mesRef, -12);
    const card = (rot, val, delta, cls) => { const d = el('div', 'pm-kpi'); d.append(el('div', 'pm-kpi-label', rot), el('div', 'pm-kpi-value', val)); const x = el('div', 'pm-kpi-delta'); if (Array.isArray(delta)) x.append(...delta); else x.textContent = delta || ''; d.appendChild(x); if (cls) d.classList.add(cls); box.appendChild(d); };
    const vs = (a, b) => { if (!b) return null; const v = a / b - 1; return el('span', v > 0 ? 'pm-up' : v < 0 ? 'pm-down' : '', pct.format(v) + ' vs. ' + curto(ly)); };
    const nm = nomeMes(mesRef, { year: undefined });
    card('Fechamento previsto de ' + nm + ' (peças)', int.format(L.fechamento), [el('span', '', int.format(L.mtd) + ' vendidas até ontem · '), vs(L.fechamento, sP.get(ly)) || '']);
    card('Fechamento previsto de ' + nm + ' (GMV)', brl.format(G.fechamento), [el('span', '', brl.format(G.mtd) + ' até ontem · '), vs(G.fechamento, sG.get(ly)) || '']);
    const prox = L.futuros.slice(0, 3), soma = prox.reduce((a, b) => a + b.valor, 0), somaLy = prox.reduce((a, b) => a + (sP.get(P.addMes(b.mes, -12)) || 0), 0);
    const v3 = somaLy ? soma / somaLy - 1 : null;
    card('Próximos 3 meses (' + curto(prox[0].mes) + ' a ' + curto(prox[2].mes) + '), peças', int.format(soma), v3 == null ? '' : [el('span', v3 > 0 ? 'pm-up' : 'pm-down', pct.format(v3) + ' vs. mesmos meses do ano anterior')]);
    const its = R.itens.map((i) => ({ i, s: status(i) }));
    const risco30 = its.filter(({ i, s }) => s === 'zerado' || (i.ruptura && i.share > 0 && diasAte(i.ruptura) <= 30)).length;
    const zer = its.filter(({ s }) => s === 'zerado').length;
    card('Peças em risco de acabar em 30 dias', int.format(risco30), zer ? zer + ' já estão sem estoque' : 'nenhuma está sem estoque');
    const comprar = R.itens.reduce((a, b) => a + b.comprar, 0), nComprar = R.itens.filter((i) => i.comprar > 0).length;
    card('Compra sugerida (peças)', int.format(comprar), 'em ' + int.format(nComprar) + ' produtos/tamanhos');
  }

  // ---------- gráfico mensal ----------
  function tooltip(box) { const t = el('div', 'pm-tip'); t.hidden = true; box.appendChild(t); return t; }
  function posTip(tip, box, ev) { const [mx, my] = d3.pointer(ev, box); tip.hidden = false; tip.style.left = Math.max(0, Math.min(box.clientWidth - tip.offsetWidth, mx + 12)) + 'px'; tip.style.top = Math.max(0, my - tip.offsetHeight - 8) + 'px'; }
  function legenda(id, itens) { const leg = document.getElementById(id); leg.replaceChildren(); for (const [c, t, op] of itens) { const s = el('span'); const i = el('i'); i.style.background = c; if (op) i.style.opacity = op; s.append(i, t); leg.appendChild(s); } }

  function drawMensal() {
    pressed('#est-seg-metrica', 'm', st.m);
    const L = st.m === 'pecas' ? R.loja : R.gmv, s = serieMensal(st.m);
    const fmtV = (v) => st.m === 'pecas' ? int.format(v) : brl.format(v);
    document.getElementById('est-mensal-titulo').textContent = (st.m === 'pecas' ? 'Peças' : 'GMV') + ': últimos 12 meses e previsão dos próximos 6';
    const meses = []; for (let i = -12; i <= 6; i++) meses.push(P.addMes(mesRef, i));
    const fut = new Map(L.futuros.map((f) => [f.mes, f.valor]));
    const data = meses.map((k) => ({ k, real: k < mesRef ? (s.get(k) || 0) : k === mesRef ? L.mtd : 0, prev: k === mesRef ? L.restante : (fut.get(k) || 0), ly: s.get(P.addMes(k, -12)) }));
    const box = document.getElementById('est-grafico-mensal'); box.replaceChildren();
    const cor = (window.dash && dash.colors && dash.colors[0]) || 'var(--serie-1)';
    legenda('est-legenda-mensal', [[cor, 'Realizado'], [cor, 'Previsto', 0.35], ['var(--cds-chart-axis)', 'Mesmo mês do ano anterior']]);
    const W = Math.max(300, box.clientWidth), H = 260, mt = 14, mb = 26;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Vendas realizadas e previstas por mês');
    const x = d3.scaleBand(meses, [0, W]).paddingInner(0.25).paddingOuter(0.05);
    const maxV = d3.max(data, (d) => Math.max(d.real + d.prev, d.ly || 0)) || 1;
    const y = d3.scaleLinear([0, maxV * 1.05], [H - mb, mt]);
    svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    const g = svg.selectAll('g.b').data(data).join('g').attr('class', 'b');
    g.append('rect').attr('x', (d) => x(d.k)).attr('width', x.bandwidth()).attr('y', mt).attr('height', H - mb - mt).attr('fill', 'transparent');
    g.filter((d) => d.real > 0).append('rect').attr('x', (d) => x(d.k)).attr('width', x.bandwidth()).attr('y', (d) => y(d.real)).attr('height', (d) => Math.max(1, y(0) - y(d.real))).attr('rx', 3).attr('fill', cor);
    g.filter((d) => d.prev > 0).append('rect').attr('x', (d) => x(d.k)).attr('width', x.bandwidth()).attr('y', (d) => y(d.real + d.prev)).attr('height', (d) => Math.max(1, y(d.real) - y(d.real + d.prev))).attr('rx', 3).attr('fill', cor).attr('fill-opacity', 0.35);
    g.filter((d) => d.ly != null).append('line').attr('x1', (d) => x(d.k) - 2).attr('x2', (d) => x(d.k) + x.bandwidth() + 2).attr('y1', (d) => y(d.ly)).attr('y2', (d) => y(d.ly)).attr('stroke', 'var(--color-fg-muted)').attr('stroke-width', 2);
    const passo = x.bandwidth() < 26 ? 2 : 1;
    g.append('text').attr('x', (d) => x(d.k) + x.bandwidth() / 2).attr('y', H - mb + 17).attr('text-anchor', 'middle').attr('fill', (d) => d.k === mesRef ? 'var(--color-fg)' : 'var(--color-fg-muted)').style('font-size', '0.68rem')
      .text((d, i) => (i % passo === 0 || d.k === mesRef) ? curto(d.k) : '');
    const tip = tooltip(box);
    g.on('mousemove', (ev, d) => {
      tip.replaceChildren(el('div', 'pm-tip-h', cap(nomeMes(d.k))));
      if (d.k < mesRef) tip.appendChild(el('div', '', 'Realizado: ' + fmtV(d.real)));
      else if (d.k === mesRef) tip.append(el('div', '', 'Até ontem: ' + fmtV(d.real)), el('div', '', 'Previsto até o fim do mês: +' + fmtV(d.prev)), el('div', '', 'Fechamento previsto: ' + fmtV(d.real + d.prev)));
      else tip.appendChild(el('div', '', 'Previsto: ' + fmtV(d.prev)));
      if (d.ly != null) { const tot = d.real + d.prev; tip.appendChild(el('div', '', 'Ano anterior: ' + fmtV(d.ly) + (d.ly ? ' (' + pct.format(tot / d.ly - 1) + ')' : ''))); }
      posTip(tip, box, ev);
    }).on('mouseleave', () => { tip.hidden = true; });
  }

  // ---------- gráfico diário do mês ----------
  function drawDiario() {
    const L = R.loja;
    const porDia = new Map(DADOS.diario_total.map((r) => [r.day, r.net_items_sold || 0]));
    const nd = P.diasNoMes(mesRef), mesLy = P.addMes(mesRef, -12), ndLy = P.diasNoMes(mesLy);
    const prev = new Map(L.diasRestantes.map((d) => [d.dia, d.valor]));
    const dias = []; for (let d = 1; d <= nd; d++) { const k = mesRef + '-' + String(d).padStart(2, '0'); const kl = mesLy + '-' + String(Math.min(d, ndLy)).padStart(2, '0'); dias.push({ k, d, real: k <= ref ? (porDia.get(k) || 0) : null, prev: prev.get(k) ?? null, ly: d <= ndLy ? porDia.get(kl) ?? null : null }); }
    document.getElementById('est-diario-titulo').textContent = cap(nomeMes(mesRef, { year: undefined })) + ' dia a dia (peças)';
    document.getElementById('est-diario-nota').textContent = `Até ontem (${dataCurta(ref)}) foram ${int.format(L.mtd)} peças. Pela curva dos últimos 12 meses, até este dia costuma estar vendido ${pct.format(L.parcela).replace('+', '')} do mês; no ritmo atual o mês fecharia em ${int.format(L.ritmo)} peças e pela sazonalidade em ${int.format(L.sazonal)}. A previsão usada é ${int.format(L.fechamento)} peças, com ${int.format(L.restante)} nos próximos ${nd - +ref.slice(8)} dias.`;
    const box = document.getElementById('est-grafico-diario'); box.replaceChildren();
    const cor = (window.dash && dash.colors && dash.colors[0]) || 'var(--serie-1)';
    legenda('est-legenda-diario', [[cor, 'Realizado'], [cor, 'Previsto', 0.35], ['var(--color-fg-muted)', 'Mesmo dia do ano anterior']]);
    const W = Math.max(300, box.clientWidth), H = 220, mt = 10, mb = 24;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Vendas do mês por dia, realizadas e previstas');
    const x = d3.scaleBand(dias.map((d) => d.k), [0, W]).paddingInner(0.2).paddingOuter(0.05);
    const maxV = d3.max(dias, (d) => Math.max(d.real || 0, d.prev || 0, d.ly || 0)) || 1;
    const y = d3.scaleLinear([0, maxV * 1.08], [H - mb, mt]);
    svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    const g = svg.selectAll('g.b').data(dias).join('g').attr('class', 'b');
    g.append('rect').attr('x', (d) => x(d.k)).attr('width', x.bandwidth()).attr('y', mt).attr('height', H - mb - mt).attr('fill', 'transparent');
    g.filter((d) => d.real != null).append('rect').attr('x', (d) => x(d.k)).attr('width', x.bandwidth()).attr('y', (d) => y(d.real)).attr('height', (d) => Math.max(1, y(0) - y(d.real))).attr('rx', 2).attr('fill', cor);
    g.filter((d) => d.prev != null).append('rect').attr('x', (d) => x(d.k)).attr('width', x.bandwidth()).attr('y', (d) => y(d.prev)).attr('height', (d) => Math.max(1, y(0) - y(d.prev))).attr('rx', 2).attr('fill', cor).attr('fill-opacity', 0.35);
    const linha = d3.line().defined((d) => d.ly != null).x((d) => x(d.k) + x.bandwidth() / 2).y((d) => y(d.ly));
    svg.append('path').datum(dias).attr('d', linha).attr('fill', 'none').attr('stroke', 'var(--color-fg-muted)').attr('stroke-width', 1.5).attr('pointer-events', 'none');
    const passo = x.bandwidth() < 14 ? 5 : x.bandwidth() < 22 ? 2 : 1;
    g.append('text').attr('x', (d) => x(d.k) + x.bandwidth() / 2).attr('y', H - mb + 16).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').style('font-size', '0.68rem').text((d) => (d.d === 1 || d.d % passo === 0) ? d.d : '');
    const tip = tooltip(box);
    g.on('mousemove', (ev, d) => {
      tip.replaceChildren(el('div', 'pm-tip-h', dataBR(d.k)));
      if (d.real != null) tip.appendChild(el('div', '', 'Vendido: ' + int.format(d.real) + ' peças'));
      if (d.prev != null) tip.appendChild(el('div', '', 'Previsto: ' + int.format(d.prev) + ' peças'));
      if (d.ly != null) tip.appendChild(el('div', '', 'Ano anterior: ' + int.format(d.ly) + ' peças'));
      posTip(tip, box, ev);
    }).on('mouseleave', () => { tip.hidden = true; });
  }

  // ---------- tabela ----------
  const ordTam = (t) => { if (/^\d+$/.test(t)) return [0, +t]; const Lt = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG']; const i = Lt.indexOf(t); return i >= 0 ? [1, i] : [2, 0]; };
  const cmpTam = (a, b) => { const A = ordTam(a.tamanho), B = ordTam(b.tamanho); return A[0] - B[0] || A[1] - B[1] || String(a.tamanho).localeCompare(String(b.tamanho)); };

  function linhas() {
    const v = st.v, dims = v.split('_');
    const meses3 = R.loja.futuros.slice(0, 3).map((f) => f.mes);
    const its = R.itens.map((i) => ({ ...i, status: status(i) })).filter((i) => i.status);
    if (v === 'produto_tamanho') return its.map((i) => ({ ...i, produto: i.produto + (i.variante !== 'Default Title' && i.tamanho === 'Único' ? ' (' + i.variante + ')' : ''), m1: i.prev_meses[meses3[0]], m2: i.prev_meses[meses3[1]], m3: i.prev_meses[meses3[2]], media3: i.vendas_janela_fechada / 3, n: 1 }));
    const acc = new Map();
    for (const i of its) {
      const k = dims.map((d) => i[d]).join('\u0001');
      let a = acc.get(k);
      if (!a) { a = { id: k, estampa: i.estampa, categoria: i.categoria, produto: i.produto, tamanho: i.tamanho, estoque: 0, prev_resto_mes: 0, m1: 0, m2: 0, m3: 0, media3: 0, comprar: 0, diaria: 0, ruptura: null, status: null, n: 0, nRisco: 0 }; acc.set(k, a); }
      a.estoque += Math.max(0, i.estoque); a.prev_resto_mes += i.prev_resto_mes; a.m1 += i.prev_meses[meses3[0]]; a.m2 += i.prev_meses[meses3[1]]; a.m3 += i.prev_meses[meses3[2]];
      a.media3 += i.vendas_janela_fechada / 3; a.comprar += i.comprar; a.diaria += i.cobertura_dias ? Math.max(0, i.estoque) / i.cobertura_dias : 0; a.n++;
      if (i.ruptura && i.share > 0 && (a.ruptura == null || i.ruptura === 'agora' || (a.ruptura !== 'agora' && i.ruptura < a.ruptura))) a.ruptura = i.ruptura;
      if (a.status == null || STATUS[i.status].o < STATUS[a.status].o) a.status = i.status; a.cont = a.cont || {}; a.cont[i.status] = (a.cont[i.status] || 0) + 1;
      if (i.comprar > 0) a.nRisco++;
    }
    return [...acc.values()].map((a) => ({ ...a, cobertura_dias: a.diaria > 0 ? a.estoque / a.diaria : null }));
  }

  function drawTabela() {
    pressed('#est-seg-visao', 'v', st.v); pressed('#est-seg-filtro', 'f', st.f);
    const v = st.v, meses3 = R.loja.futuros.slice(0, 3).map((f) => f.mes);
    const nm = nomeMes(mesRef, { year: undefined });
    const cols = [];
    if (v.includes('estampa')) cols.push({ f: 'estampa', label: 'Estampa', txt: true });
    if (v.includes('categoria')) cols.push({ f: 'categoria', label: 'Categoria', txt: true });
    if (v.includes('produto')) cols.push({ f: 'produto', label: 'Produto', txt: true });
    if (v.includes('tamanho')) cols.push({ f: 'tamanho', label: 'Tamanho', txt: true, size: true });
    cols.push(
      { f: 'status', label: 'Situação', st: true },
      { f: 'estoque', label: 'Estoque hoje', fmt: (x) => int.format(x) },
      { f: 'media3', label: 'Média/mês (3 meses)', fmt: (x) => int.format(x), sm: true },
      { f: 'prev_resto_mes', label: 'Previsto resto de ' + nm, fmt: (x) => int.format(x) },
      { f: 'm1', label: 'Prev. ' + curto(meses3[0]), fmt: (x) => int.format(x) },
      { f: 'm2', label: 'Prev. ' + curto(meses3[1]), fmt: (x) => int.format(x), sm: true },
      { f: 'm3', label: 'Prev. ' + curto(meses3[2]), fmt: (x) => int.format(x), sm: true },
      { f: 'cobertura_dias', label: 'Cobertura (dias)', fmt: (x) => x == null ? '—' : x > 365 ? '> 1 ano' : int.format(x) },
      { f: 'ruptura', label: 'Acaba em', rup: true },
      { f: 'comprar', label: 'Comprar (peças)', fmt: (x) => x > 0 ? int.format(x) : '—', strong: true },
    );
    let rows = linhas();
    if (st.f === 'risco') rows = rows.filter((r) => r.comprar > 0 || r.status === 'zerado' || r.status === 'urgente');
    else if (st.f === 'excesso') rows = rows.filter((r) => r.status === 'excesso' || r.status === 'parado');
    if (st.q) rows = rows.filter((r) => (r.estampa + ' ' + r.categoria + ' ' + r.produto + ' ' + r.tamanho).toLowerCase().includes(st.q));
    const rupK = (r) => r.ruptura === 'agora' ? '0000' : r.ruptura || '9999';
    const sc = st.sort, dir = st.dir;
    rows.sort((a, b) => {
      if (!sc) return STATUS[a.status].o - STATUS[b.status].o || rupK(a).localeCompare(rupK(b)) || b.comprar - a.comprar || b.media3 - a.media3;
      if (sc === 'tamanho') return dir * cmpTam(a, b);
      if (sc === 'status') return dir * (STATUS[a.status].o - STATUS[b.status].o);
      if (sc === 'ruptura') return dir * rupK(a).localeCompare(rupK(b));
      const c = cols.find((x) => x.f === sc);
      if (c && c.txt) return dir * (String(a[sc]).localeCompare(String(b[sc]), 'pt-BR') || cmpTam(a, b));
      return dir * ((a[sc] ?? -1e15) - (b[sc] ?? -1e15));
    });
    const table = document.getElementById('est-tabela');
    const hr = table.querySelector('thead tr'); hr.replaceChildren();
    for (const c of cols) {
      const th = el('th', c.txt ? 'pm-txt' : ''); if (c.sm) th.classList.add('pm-hide-sm'); if (c.st) th.classList.add('pm-txt');
      th.setAttribute('aria-sort', sc === c.f ? (dir < 0 ? 'descending' : 'ascending') : 'none');
      const b = el('button', '', c.label + (sc === c.f ? (dir < 0 ? ' ↓' : ' ↑') : '')); b.type = 'button';
      b.addEventListener('click', () => { if (st.sort === c.f) st.dir = -st.dir; else { st.sort = c.f; st.dir = c.txt || c.rup || c.st ? 1 : -1; } drawTabela(); });
      th.appendChild(b); hr.appendChild(th);
    }
    const body = [];
    const LIM = 400;
    for (const r of rows.slice(0, LIM)) {
      const tr = el('tr');
      for (const c of cols) {
        let td;
        if (c.txt) { td = el('td', 'pm-txt' + (c.size ? ' pm-size' : ''), r[c.f]); }
        else if (c.st) { const S = STATUS[r.status]; td = el('td', 'pm-txt'); const chip = el('span', 'pm-chip', S.t + (r.n > 1 ? ' (' + r.cont[r.status] + ')' : '')); chip.style.color = S.c; td.appendChild(chip); if (r.n > 1 && r.nRisco) td.appendChild(el('small', 'pm-sub', r.nRisco + ' de ' + r.n + ' para comprar')); }
        else if (c.rup) { const x = r.ruptura; td = el('td', '', x === 'agora' ? 'já acabou' : x ? dataBR(x) : (r.status === 'parado' ? '—' : 'depois de ' + curto(R.loja.futuros[5].mes))); if (x && (x === 'agora' || diasAte(x) <= st.prazo)) td.classList.add('pm-bad'); }
        else { td = el('td', '', c.fmt(r[c.f])); if (c.strong && r[c.f] > 0) td.style.fontWeight = 'var(--cds-font-weight-medium)'; }
        if (c.sm) td.classList.add('pm-hide-sm');
        tr.appendChild(td);
      }
      body.push(tr);
    }
    if (!body.length) { const tr = el('tr'); const td = el('td', 'pm-txt', st.q ? 'Nada encontrado para essa busca.' : 'Nenhuma peça nesta situação.'); td.colSpan = cols.length; tr.appendChild(td); body.push(tr); }
    table.querySelector('tbody').replaceChildren(...body);
    const tot = rows.reduce((a, b) => a + b.comprar, 0);
    const tit = { produto_tamanho: 'por produto e tamanho', produto: 'por produto', estampa_tamanho: 'por estampa e tamanho', categoria_tamanho: 'por categoria e tamanho', estampa: 'por estampa', tamanho: 'por tamanho' };
    document.getElementById('est-tabela-titulo').textContent = 'Risco de ruptura e compra sugerida ' + tit[v];
    document.getElementById('est-tabela-nota').textContent = `Estoque no fim de ${dataBR(ref)}. Compra sugerida para cobrir a venda prevista de amanhã até ${st.prazo + st.cobertura} dias (${st.prazo} de reposição + ${st.cobertura} de cobertura), descontado o estoque de hoje. Ordenado pelo que acaba primeiro; clique nos títulos para reordenar.`;
    document.getElementById('est-rodape').textContent = `${int.format(rows.length)} linhas${rows.length > LIM ? ' (mostrando as ' + LIM + ' primeiras)' : ''} · ${int.format(tot)} peças a comprar nesta lista. As variantes de 6 e 12 canetinhas do mesmo tamanho e cor são a mesma peça: as vendas somam e o estoque conta uma vez.`;
    legenda('est-legenda-status', Object.values(STATUS).filter((s) => s.o < 4 || st.f !== 'risco').map((s) => [s.c, s.t]));
  }

  function janela() {
    document.getElementById('est-janela').textContent = `Previsão feita com a venda do site fechada até ${dataBR(ref)} e o estoque do fim desse dia.`;
  }

  function desenha() { if (!DADOS || document.getElementById('aba-estoque').hidden) return; if (!R) calcula(); janela(); drawCards(); drawMensal(); drawDiario(); drawTabela(); }
  window.drawEstoque = desenha;
  window.EstoqueAba = { define(D) { DADOS = D; ref = D.referencia; mesRef = ref.slice(0, 7); R = null; desenha(); }, carregado: () => !!DADOS };

  document.getElementById('est-prazo').value = st.prazo; document.getElementById('est-cobertura').value = st.cobertura;
  const muda = () => { const p = +document.getElementById('est-prazo').value, c = +document.getElementById('est-cobertura').value; if (!(p >= 0 && c >= 0)) return; st.prazo = Math.min(365, p); st.cobertura = Math.min(365, c); guarda.grava('prazo', st.prazo); guarda.grava('cobertura', st.cobertura); if (DADOS) { calcula(); desenha(); } };
  document.getElementById('est-prazo').addEventListener('change', muda); document.getElementById('est-cobertura').addEventListener('change', muda);
  document.getElementById('est-seg-metrica').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.m = b.dataset.m; drawMensal(); } });
  document.getElementById('est-seg-visao').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.v = b.dataset.v; st.sort = null; guarda.grava('visao', st.v); drawTabela(); } });
  document.getElementById('est-seg-filtro').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.f = b.dataset.f; drawTabela(); } });
  document.getElementById('est-busca').addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); drawTabela(); });
  document.getElementById('abas').addEventListener('click', () => setTimeout(desenha, 0));
  let larg = 0; window.addEventListener('resize', () => { const w = document.getElementById('aba-estoque').clientWidth; if (DADOS && R && w && Math.abs(w - larg) > 40) { larg = w; drawMensal(); drawDiario(); } });
})();
