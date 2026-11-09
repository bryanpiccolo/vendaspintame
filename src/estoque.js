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

  // Produtos que ficam fora do risco de ruptura e da compra sugerida (nome do produto ou categoria).
  const FORA = [
    ['Coleção Copa do Mundo (inclui Futebol, Amarelinho e kits ⚽)', /copa do mundo|futebol|amarelinho|⚽/i],
    ['Camisetas adulto', /camiseta adulto/i],
    ['Camisetas com bolso', /camiseta bolso/i],
    ['Kits de canetinhas', /^kit de \d+ canetinhas/i],
    ['Scrunchie', /scrunchie/i],
    ['Calças', /^cal[cç]a/i],
    ['Estojos e lancheiras', /estojo|lancheira/i],
    ['Mochilas', /mochila/i],
    ['Bermudas e shorts', /bermuda|short/i],
    ['Casacos, blusões e moletons', /casaco|blus[aã]o|moletom|jaqueta/i],
  ];
  const fora = (i) => FORA.some(([, re]) => re.test(i.produto) || re.test(i.categoria));
  const st = { m: 'pecas', v: 'produto', e: guarda.le('estampa', ''), pe: guarda.le('pestampa', ''), me: guarda.le('mlestampa', ''), abertos: new Set(), f: 'risco', q: '', sort: null, dir: 1, prazo: +guarda.le('prazo2', 22), cobertura: +guarda.le('cobertura', 60) };
  st.mlN = null; st.mlRes = 30;
  st.pv = ['estampa', 'produto', 'categoria'].includes(guarda.le('pvisao', 'estampa')) ? guarda.le('pvisao', 'estampa') : 'estampa'; st.pm = null;
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
    rascunho: { t: 'Rascunho ou oculto no Shopify', c: 'var(--color-fg-muted)', o: 6 },
  };

  // ---------- premissas ----------
  function drawPremissas() {
    const L = R.loja, s = serieMensal('pecas'), box = document.getElementById('est-premissas');
    const p1 = (v) => v == null ? '—' : pct.format(v);
    const nomesBase = L.base.slice().reverse().map((m) => nomeMes(m, { year: undefined })).join(' e ');
    const lis = [
      `Queda de base: ${nomesBase} somados venderam ${pct.format(Math.abs(L.varBase)).replace('+', '')} ${L.varBase < 0 ? 'menos' : 'mais'} que os mesmos meses do ano anterior.${L.fixos.length ? ' Variação definida por vocês: ' + L.fixos.map(([m, v]) => nomeMes(m, { year: undefined }) + ' ' + p1(v)).join(', ') + '.' : ''} Os outros meses ficam no meio do caminho, até vender igual ao ano anterior em ${nomeMes(L.jan)}.`,
      `${cap(nomeMes(L.jan, { year: undefined }))}: previsão de dezembro × ${L.relJan.toFixed(2).replace('.', ',')} (média de quanto janeiro vendeu em relação ao dezembro anterior nas viradas ${L.viradas.map((v) => curto(v.dez) + ' → ' + curto(v.jan)).reverse().join(' e ')}), nunca abaixo de ${nomeMes(P.addMes(L.jan, -12))}.`,
      `Depois de janeiro: cada mês = mês anterior × média de quanto esse mês vendeu sobre o anterior em ${[...new Set([...L.relacoes.values()].flat().map((r) => r.ano))].sort().join(' e ') || '—'}${[...L.relacoes.entries()].length ? ' (' + [...L.relacoes.entries()].map(([m, rs]) => curto(m) + ' ×' + (rs.reduce((a, b) => a + b.r, 0) / (rs.length || 1)).toFixed(2).replace('.', ',')).join(', ') + ')' : ''}.`,
      `${cap(nomeMes(mesRef, { year: undefined }))}: até ontem foram ${int.format(L.mtd)} peças. No ano passado, até este dia, já estava vendido ${pct.format(L.parcela).replace('+', '')} do mês, então no ritmo atual fecharia em ${int.format(L.ritmo)}; pela regra da queda fecharia em ${int.format(L.sazonal)}. A previsão junta os dois: ${int.format(L.fechamento)} peças. Os dias que faltam seguem a curva diária do mesmo mês do ano passado.`,
      `Curva diária: dias do ano passado fora das datas fixas (Dia das Crianças, Black Friday e Natal) que venderam mais que o dobro ou menos que a metade dos dias em volta foram suavizados${L.curvaAjustada && L.curvaAjustada.length ? ` (${L.curvaAjustada.length} dias ajustados)` : ''}, para um pico ou uma queda pontual de 2025 não se repetir na previsão.`,
      `Por peça: participação nas vendas de ${nomesBase} e do mês atual, sempre em relação ao total da loja. Dias em que a peça estava sem estoque não contam (${R.itens.filter((i) => i.ajuste_ruptura).length} peças ajustadas), e um mês em que ela vendeu mais de ${String(P.REGRAS.tetoPico).replace('.', ',')} × o normal dela, por promoção, fica limitado a esse teto (${R.itens.filter((i) => i.ajuste_pico).length} peças). Para ter estoque para crescer, a venda prevista de cada peça é ${pct.format(P.REGRAS.ousadia).replace('+', '')} acima da projeção. Compra × 1,3 para o quarto de peças com maior sell-through (a partir de ${pct.format(R.cortesST[0][0]).replace('+', '')}) e × 1,15 para o quarto seguinte (a partir de ${pct.format(R.cortesST[1][0]).replace('+', '')}).`,
      DADOS.estoque_bling ? `Estoque hoje: físico do Bling, lido em ${new Date(DADOS.estoque_bling.gerado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}. Nos kits, conta a peça de roupa (as canetinhas são um item à parte); as vendas continuam sendo as do site.${DADOS.estoque_bling.sem_par && DADOS.estoque_bling.sem_par.length ? ' ' + DADOS.estoque_bling.sem_par.length + ' SKUs sem cadastro no Bling ficam com estoque 0.' : ''}` : 'Estoque hoje: do Shopify (o arquivo do Bling não foi carregado).',
    ];
    const ul = el('ul', 'pm-regras'); for (const t of lis) ul.appendChild(el('li', '', t));
    const tb = el('table', 'pm-table'); const th = el('tr');
    for (const t of ['Mês', 'Ano anterior', 'Variação', 'Previsto']) th.appendChild(el('th', t === 'Mês' ? 'pm-txt' : '', t));
    tb.appendChild(el('thead')).appendChild(th); const bd = el('tbody');
    for (const f of [{ mes: mesRef, valor: L.fechamento }, ...L.futuros]) {
      const ly = s.get(P.addMes(f.mes, -12)), v = ly ? f.valor / ly - 1 : null, tr = el('tr');
      tr.append(el('td', 'pm-txt', cap(nomeMes(f.mes)) + (f.mes === mesRef ? ' (em andamento)' : '')), el('td', '', ly == null ? '—' : int.format(ly)), el('td', v == null ? '' : v >= 0 ? 'pm-up' : 'pm-down', p1(v)), el('td', '', int.format(f.valor)));
      bd.appendChild(tr);
    }
    tb.appendChild(bd);
    box.replaceChildren(ul, tb);
  }

  // ---------- gráfico mensal ----------
  function tooltip(box) { const t = el('div', 'pm-tip'); t.hidden = true; box.appendChild(t); return t; }
  function posTip(tip, box, ev) { const [mx, my] = d3.pointer(ev, box); tip.hidden = false; tip.style.left = Math.max(0, Math.min(box.clientWidth - tip.offsetWidth, mx + 12)) + 'px'; tip.style.top = Math.max(0, my - tip.offsetHeight - 8) + 'px'; }
  function legenda(id, itens) { const leg = document.getElementById(id); leg.replaceChildren(); for (const [c, t, op] of itens) { const s = el('span'); const i = el('i'); i.style.background = c; if (op) i.style.opacity = op; s.append(i, t); leg.appendChild(s); } }

  // ---------- tabela ----------
  const ordTam = (t) => { if (/^\d+$/.test(t)) return [0, +t]; const Lt = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG']; const i = Lt.indexOf(t); return i >= 0 ? [1, i] : [2, 0]; };
  const cmpTam = (a, b) => { const A = ordTam(a.tamanho), B = ordTam(b.tamanho); return A[0] - B[0] || A[1] - B[1] || String(a.tamanho).localeCompare(String(b.tamanho)); };

  // estoque no fim de cada mês (f0 = mês atual, f1..f3 = próximos) e cobertura em dias a partir dali (c0..c3).
  // Cobertura negativa = mais que |c| dias (passa do horizonte da previsão). No grupo: soma do estoque e o menor
  // prazo entre as peças que vendem (tamanhos não substituem um ao outro).
  function fimCob(its, ms) {
    const o = {};
    ms.forEach((m, k) => {
      o['f' + k] = its.reduce((a, i) => a + ((i.fim_mes && i.fim_mes[m]) || 0), 0);
      const cs = its.filter((i) => i.share > 0 && i.cob_fim && i.cob_fim[m] != null).map((i) => i.cob_fim[m]);
      o['c' + k] = cs.length ? cs.reduce((a, c) => ((c < 0 ? -c + 0.5 : c) < (a < 0 ? -a + 0.5 : a) ? c : a)) : null;
    });
    return o;
  }
  const fmtCob = (c) => c == null ? '' : c < 0 ? 'cobre mais de ' + int.format(Math.floor(-c / 30)) + ' meses' : c === 0 ? 'zerado' : 'cobre ' + int.format(c) + ' dias';
  function linhas(v = st.v, generico = false) {
    const dims = v.split('_');
    const meses3 = R.loja.futuros.slice(0, 3).map((f) => f.mes), ms = [mesRef, ...meses3];
    // rascunhos e ocultos do Shopify entram só nesta tabela (sem previsão nem compra)
    const its = [...R.itens.filter((i) => !fora(i)).map((i) => ({ ...i, status: status(i) })), ...(R.rascunhos || []).filter((i) => !fora(i)).map((i) => ({ ...i, status: 'rascunho' }))].filter((i) => i.status);
    if (v === 'produto_tamanho' && !generico) return its.map((i) => ({ ...i, produto: i.produto + (i.variante !== 'Default Title' && i.tamanho === 'Único' ? ' (' + i.variante + ')' : ''), m1: i.prev_meses[meses3[0]], m2: i.prev_meses[meses3[1]], m3: i.prev_meses[meses3[2]], ...fimCob([i], ms), media3: i.vendas_janela_fechada / P.REGRAS.mesesBase, vj: i.vendas_janela, n: 1 }));
    const acc = new Map();
    for (const i of its) {
      const k = dims.map((d) => i[d]).join('\u0001');
      let a = acc.get(k);
      if (!a) { a = { id: k, estampa: i.estampa, categoria: i.categoria, produto: i.produto, tamanho: i.tamanho, estoque: 0, prev_resto_mes: 0, m1: 0, m2: 0, m3: 0, media3: 0, vj: 0, comprar: 0, sobra_chegada: 0, dem_cobertura: 0, necessidade: 0, share: 0, ruptura: null, status: null, n: 0, nRisco: 0, nZero: 0, zeros: [], prev_meses: {}, itens: [] }; acc.set(k, a); }
      a.itens.push(i);
      a.estoque += Math.max(0, i.estoque); a.prev_resto_mes += i.prev_resto_mes; a.m1 += i.prev_meses[meses3[0]]; a.m2 += i.prev_meses[meses3[1]]; a.m3 += i.prev_meses[meses3[2]];
      a.media3 += i.vendas_janela_fechada / P.REGRAS.mesesBase; a.vj += i.vendas_janela; a.comprar += i.comprar; a.sobra_chegada += Math.min(i.sobra_chegada, i.necessidade); a.dem_cobertura += i.dem_cobertura; a.necessidade += i.necessidade; a.share += i.share; a.n++; if (i.esc != null) { a.esc = (a.esc || 0) + i.esc; a.cor = (a.cor || 0) + (i.cor || 0); } if (i.estoque <= 0 && i.share > 0) { a.nZero++; a.zeros.push(i.tamanho !== 'Único' ? i.tamanho : (i.variante !== 'Default Title' ? i.variante : 'único')); } for (const k in i.prev_meses) a.prev_meses[k] = (a.prev_meses[k] || 0) + i.prev_meses[k];
      if (i.comprar > 0) a.nRisco++;
    }
    const d30 = R.dias.slice(0, 30).reduce((x, d) => x + d.valor, 0) / 30;
    return [...acc.values()].map((a) => {
      // o grupo mostra o primeiro tamanho/peça que acaba (tamanhos não substituem um ao outro)
      const comVenda = a.itens.filter((i) => i.share > 0);
      const rk = (i) => i.ruptura === 'agora' ? '0000' : i.ruptura || '9999';
      const prim = comVenda.slice().sort((x, y) => rk(x).localeCompare(rk(y)))[0];
      const acabam = comVenda.filter((i) => i.ruptura);
      const cobs = comVenda.map((i) => i.cobertura_dias).filter((c) => c != null);
      a.sell_through = a.vj > 0 ? a.vj / (a.vj + a.estoque) : null;
      const g = { ...a, ...fimCob(a.itens, ms), ruptura: prim ? prim.ruptura : null, rup_quem: prim && prim.ruptura ? (dims.includes('produto') ? 'tam. ' + prim.tamanho : prim.produto.replace(/ Infantil para Colorir| \+ 6 canetinhas/g, '') + (prim.tamanho !== 'Único' ? ' ' + prim.tamanho : '')) : '', rup_n: acabam.length, itens_venda: comVenda.length, cobertura_dias: cobs.length ? Math.min(...cobs) : null };
      const soRasc = a.itens.every((i) => i.rascunho);
      delete g.itens;
      g.status = soRasc ? 'rascunho' : status(g);
      return g;
    }).filter((g) => g.status);
  }

  // filtro por estampa (o mesmo em todos os quadros da aba): lista da estampa que mais vende para a que menos vende
  function encheEstampas(id, itens, atual) {
    const sel = document.getElementById(id); if (!sel) return atual;
    const vendas = new Map();
    for (const i of itens) if (i.estampa) vendas.set(i.estampa, (vendas.get(i.estampa) || 0) + (i.vendas_janela || i.v || 0));
    const ests = [...vendas.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
    if (atual && !ests.includes(atual)) atual = '';
    if (sel.dataset.lista !== ests.join('|')) { sel.replaceChildren(el('option', '', 'Todas')); sel.firstChild.value = ''; for (const e of ests) { const o = el('option', '', e); o.value = e; sel.appendChild(o); } sel.dataset.lista = ests.join('|'); }
    sel.value = atual;
    return atual;
  }
  function drawTabela() {
    pressed('#est-seg-filtro', 'f', st.f);
    // filtro por estampa: lista das estampas, da que mais vende para a que menos vende
    st.e = encheEstampas('est-estampa', R.itens.filter((i) => !fora(i)), st.e);
    const cols = [
      { f: 'produto', label: 'Produto', txt: true },
      { f: 'status', label: 'Situação', st: true },
      { f: 'estoque', label: 'Estoque hoje', fmt: (x) => int.format(x) },
      { f: 'media3', label: 'Vende por mês', fmt: (x) => int.format(x), tip: 'Média de peças vendidas por mês nos ' + P.REGRAS.mesesBase + ' últimos meses fechados' },
      { f: 'ruptura', label: 'Acaba em', rup: true, tip: 'Nas linhas de produto: data em que o primeiro tamanho acaba' },
      { f: 'comprar', label: 'Comprar', fmt: (x) => x > 0 ? int.format(x) : '—', strong: true, tip: 'Peças a comprar hoje. Passe o mouse no número para ver a conta' },
    ];
    let rows = linhas();
    if (st.e) rows = rows.filter((r) => r.estampa === st.e);
    if (st.f === 'risco') rows = rows.filter((r) => r.comprar > 0 || r.status === 'zerado' || r.status === 'urgente');
    else if (st.f === 'ruptura') rows = rows.filter((r) => r.status !== 'rascunho' && (r.nZero > 0 || r.status === 'zerado'));
    else if (st.f === 'excesso') rows = rows.filter((r) => r.status === 'excesso' || r.status === 'parado');
    else if (st.f === 'rascunho') rows = rows.filter((r) => r.status === 'rascunho');
    if (st.q) rows = rows.filter((r) => (r.estampa + ' ' + r.categoria + ' ' + r.produto + ' ' + r.tamanho).toLowerCase().includes(st.q));
    const rupK = (r) => r.ruptura === 'agora' ? '0000' : r.ruptura || '9999';
    const sc = st.sort, dir = st.dir;
    rows.sort((a, b) => {
      if (!sc) return (b.vj || 0) - (a.vj || 0) || b.media3 - a.media3 || b.comprar - a.comprar;
      if (sc === 'status') return dir * (STATUS[a.status].o - STATUS[b.status].o);
      if (sc === 'ruptura') return dir * rupK(a).localeCompare(rupK(b));
      if (sc === 'produto') return dir * String(a.produto).localeCompare(String(b.produto), 'pt-BR');
      return dir * ((a[sc] ?? -1e15) - (b[sc] ?? -1e15));
    });
    const table = document.getElementById('est-tabela');
    const hr = table.querySelector('thead tr'); hr.replaceChildren();
    for (const c of cols) {
      const th = el('th', c.txt || c.st ? 'pm-txt' : ''); if (c.tip) th.title = c.tip;
      th.setAttribute('aria-sort', sc === c.f ? (dir < 0 ? 'descending' : 'ascending') : 'none');
      const b = el('button', '', c.label + (sc === c.f ? (dir < 0 ? ' ↓' : ' ↑') : '')); b.type = 'button';
      b.addEventListener('click', () => { if (st.sort === c.f) st.dir = -st.dir; else { st.sort = c.f; st.dir = c.txt || c.rup || c.st ? 1 : -1; } drawTabela(); });
      th.appendChild(b); hr.appendChild(th);
    }
    const LIM = 400;
    const filhos = linhas('produto_tamanho', true);
    const lista = [];
    for (const r of rows.slice(0, LIM)) {
      lista.push(r);
      if (st.abertos.has(r.id)) filhos.filter((f) => f.id.startsWith(r.id + '\u0001')).sort(cmpTam).forEach((f) => lista.push({ ...f, filho: true }));
    }
    const nomeP = (n) => String(n).replace(/ Infantil para Colorir| para Colorir|\s*\+\s*0?6 canetinhas/gi, '').replace(/\s+/g, ' ').trim();
    const body = [];
    for (const r of lista) {
      const tr = el('tr');
      if (!r.filho) { tr.className = 'pm-abre'; tr.title = 'Clique para ver os tamanhos'; tr.addEventListener('click', () => { if (st.abertos.has(r.id)) st.abertos.delete(r.id); else st.abertos.add(r.id); drawTabela(); }); }
      else tr.className = 'pm-filho';
      for (const c of cols) {
        let td;
        if (c.txt) {
          if (r.filho) td = el('td', 'pm-txt', 'Tamanho ' + r.tamanho);
          else { td = el('td', 'pm-txt'); td.appendChild(el('span', 'pm-seta', st.abertos.has(r.id) ? '▾ ' : '▸ ')); td.appendChild(document.createTextNode(nomeP(r.produto))); }
        }
        else if (c.st) {
          const S = STATUS[r.status]; td = el('td', 'pm-txt'); const chip = el('span', 'pm-chip', S.t); chip.style.color = S.c; td.appendChild(chip);
          if (!r.filho && r.zeros && r.zeros.length && r.status !== 'zerado') td.appendChild(el('small', 'pm-sub pm-bad', 'sem estoque: ' + [...new Set(r.zeros)].join(', ')));
        }
        else if (c.rup) {
          const x = r.ruptura;
          if (r.status === 'rascunho' || r.status === 'parado') td = el('td', 'pm-mut', '—');
          else { td = el('td', '', x === 'agora' ? 'sem estoque' : x ? dataCurta(x) : 'depois de ' + curto(R.loja.futuros[5].mes)); if (x && (x === 'agora' || diasAte(x) <= st.prazo)) td.classList.add('pm-bad'); if (!r.filho && r.n > 1 && r.rup_quem && x && x !== 'agora') td.appendChild(el('small', 'pm-sub', r.rup_quem)); }
        }
        else if (r.status === 'rascunho' && c.f !== 'estoque' && c.f !== 'media3') td = el('td', 'pm-mut', '—');
        else {
          td = el('td', '', c.fmt(r[c.f])); if (c.strong && r[c.f] > 0) td.style.fontWeight = 'var(--cds-font-weight-medium)';
          if (c.f === 'comprar' && r.dem_cobertura != null) {
            const fat = r.dem_cobertura > 0 ? r.necessidade / r.dem_cobertura : 1;
            td.title = `Chega em ${dataBR(R.chegada)}. Venda prevista de ${dataCurta(R.chegada)} a ${dataCurta(R.fimCobertura)}: ${int.format(r.dem_cobertura)}` + (fat > 1.001 ? ` × ${fat.toFixed(2).replace('.', ',')} (sell-through) = ${int.format(r.necessidade)}` : '') + `. Estoque que sobra na chegada: ${int.format(r.sobra_chegada)}. Comprar: ${int.format(r.comprar)}.`;
          }
        }
        tr.appendChild(td);
      }
      body.push(tr);
    }
    if (!body.length) { const tr = el('tr'); const td = el('td', 'pm-txt', st.q ? 'Nada encontrado para essa busca.' : 'Nenhum produto nesta situação.'); td.colSpan = cols.length; tr.appendChild(td); body.push(tr); }
    table.querySelector('tbody').replaceChildren(...body);
    const tot = rows.reduce((a, b) => a + b.comprar, 0);
    document.getElementById('est-tabela-titulo').textContent = 'Risco de ruptura e compra sugerida' + (st.e ? ' · ' + st.e : '');
    document.getElementById('est-tabela-nota').textContent = `Do produto que mais vende para o que menos vende; clique num produto para ver os tamanhos e nos títulos para reordenar. Precisa comprar: algum tamanho sem estoque, que acaba antes da reposição ou com compra sugerida. Ruptura: produtos com algum tamanho sem estoque. Estoque hoje = ${DADOS.estoque_bling ? 'físico do Bling' : 'do Shopify no fim de ' + dataBR(ref)}. Acaba em = dia em que a venda prevista passa do estoque (vermelho: antes da reposição). Se a compra for feita hoje, chega em ${dataBR(R.chegada)} (${st.prazo} dias). Comprar = venda prevista nos ${st.cobertura} dias depois da chegada (até ${dataBR(R.fimCobertura)}) × fator de sell-through − estoque que ainda sobra no dia da chegada; passe o mouse no número para ver a conta. As variantes de 6 e 12 canetinhas do mesmo tamanho são a mesma peça. Produtos em rascunho ou ocultos no Shopify aparecem só em Todos e Rascunhos. Ficam fora: ${FORA.map((f) => f[0].toLowerCase()).join(', ')}.`;
    document.getElementById('est-rodape').textContent = `${int.format(rows.length)} produtos${rows.length > LIM ? ' (mostrando os ' + LIM + ' primeiros)' : ''} · ${int.format(tot)} peças a comprar nesta lista.`;
  }


  // ---------- estoque para ação promocional ----------
  // Por estampa (ou produto/categoria): estoque no começo do mês escolhido, venda prevista no mês, sobra no fim e
  // cobertura = estoque do começo ÷ venda prevista por dia no mês. Entram todos os produtos ativos com roupa
  // (inclusive os que ficam fora do risco de ruptura); saem embalagens, canetinhas e testes.
  const PROMO_FORA = /^(embalagem|canetinhas|teste|decora[cç][aã]o)$|^kit de \d+ canetinhas|^embalagem|envelope|box presente/i;
  function drawPromo() {
    const meses = [mesRef, ...R.loja.futuros.slice(0, 2).map((f) => f.mes)];
    if (!meses.includes(st.pm)) st.pm = meses[1];
    const m = st.pm, nd = P.diasNoMes ? P.diasNoMes(m) : 30;
    const ini = (i) => Math.max(0, m === mesRef ? i.estoque : ((i.fim_mes || {})[P.addMes(m, -1)] || 0));
    const venda = (i) => m === mesRef ? i.prev_resto_mes : (i.prev_meses[m] || 0);
    const diasM = m === mesRef ? Math.max(1, P.diasNoMes(m) - +ref.slice(8, 10)) : nd;
    const box = document.getElementById('est-promo-mes'); box.replaceChildren();
    for (const k of meses) { const b = el('button', '', k === mesRef ? 'Resto de ' + nomeMes(k, { year: undefined }) : cap(nomeMes(k, { year: undefined }))); b.type = 'button'; b.dataset.m = k; b.setAttribute('aria-pressed', String(k === m)); b.addEventListener('click', () => { st.pm = k; drawPromo(); }); box.appendChild(b); }
    pressed('#est-promo-visao', 'v', st.pv);
    const base = R.itens.filter((i) => !(PROMO_FORA.test(i.categoria) || PROMO_FORA.test(i.produto)));
    st.pe = encheEstampas('est-promo-estampa', base, st.pe);
    // com uma estampa escolhida, a visão por estampa vira uma linha só: mostra por produto
    const visao = st.pe && st.pv === 'estampa' ? 'produto' : st.pv;
    const acc = new Map();
    for (const i of base) {
      if (st.pe && i.estampa !== st.pe) continue;
      const e0 = ini(i), v = venda(i), e1 = Math.max(0, e0 - v);
      if (e0 <= 0 && v <= 0.05) continue;
      const k = i[visao];
      let a = acc.get(k); if (!a) { a = { nome: k, e0: 0, v: 0, e1: 0, vj: 0, tam: 0, tamOk: 0, zeram: [] }; acc.set(k, a); }
      a.e0 += e0; a.v += v; a.e1 += e1; a.vj += i.vendas_janela || 0;
      if (v > 0.05 || e0 > 0) { a.tam++; if (e1 >= 1) a.tamOk++; else if (v > 0.05) a.zeram.push(visao === 'produto' ? 'tam. ' + i.tamanho : i.produto.replace(/ Infantil para Colorir| para Colorir|\s*\+\s*0?6 canetinhas/gi, '').trim() + (i.tamanho !== 'Único' ? ' ' + i.tamanho : '')); }
    }
    const rows = [...acc.values()].map((a) => {
      a.cob = a.v > 0.05 ? a.e0 / (a.v / diasM) : (a.e0 > 0 ? Infinity : 0);
      const fr = a.tam ? a.tamOk / a.tam : 0;
      a.sel = a.e0 <= 0 ? 'sem' : a.cob === Infinity ? 'parado' : a.cob >= 60 && fr >= 0.7 ? 'boa' : a.cob < 30 || fr < 0.5 ? 'evitar' : 'cuidado';
      return a;
    }).sort((x, y) => y.vj - x.vj || y.v - x.v || y.e0 - x.e0);
    const SEL = { boa: ['Boa opção', 'var(--color-ok)'], parado: ['Boa opção (sem venda prevista)', 'var(--color-ok)'], cuidado: ['Com cuidado', 'var(--color-warn)'], evitar: ['Evitar', 'var(--color-bad)'], sem: ['Sem estoque', 'var(--color-bad)'] };
    const nm = nomeMes(m, { year: undefined }), inicio = m === mesRef ? 'Estoque hoje' : 'Estoque em 1º de ' + nm;
    const cols = [[{ estampa: 'Estampa', produto: 'Produto', categoria: 'Categoria' }[visao], 1], ['Para promoção', 1], [inicio, 0], ['Venda prevista ' + (m === mesRef ? 'até o fim de ' : 'em ') + nm, 0], ['Sobra no fim de ' + nm, 0], ['Cobertura no começo', 0], ['Tamanhos com estoque no fim do mês', 1]];
    const hr = document.querySelector('#est-promo thead tr'); hr.replaceChildren(...cols.map(([t, tx]) => { const th = el('th', tx ? 'pm-txt' : ''); const sp = el('span', '', t); sp.style.cssText = 'display:block;padding:var(--cds-pad-xs) var(--cds-pad-sm);white-space:nowrap'; th.appendChild(sp); return th; }));
    const maxC = Math.max(1, ...rows.map((r) => (r.cob === Infinity ? 0 : Math.min(r.cob, 180))));
    const body = rows.map((r) => {
      const tr = el('tr');
      const [t, c] = SEL[r.sel]; const tdS = el('td', 'pm-txt'); const chip = el('span', 'pm-chip', t); chip.style.color = c; tdS.appendChild(chip);
      const tdC = el('td'); const w = el('div', 'pm-cob'); const bar = el('i'); bar.style.width = (r.cob === Infinity ? 60 : Math.round(60 * Math.min(r.cob, 180) / maxC)) + 'px'; w.append(bar, el('span', '', r.cob === Infinity ? 'sem venda prevista' : r.cob > 365 ? '> 1 ano' : int.format(r.cob) + ' dias')); tdC.appendChild(w);
      const tdT = el('td', '', r.tam ? r.tamOk + ' de ' + r.tam : '—'); tdT.style.cssText = 'white-space:normal;min-width:13rem;max-width:20rem;text-align:left'; if (r.zeram.length) { const zs = [...new Set(r.zeram)]; const z = el('small', 'pm-sub', 'zeram: ' + zs.slice(0, 4).join(', ') + (zs.length > 4 ? ' e mais ' + (zs.length - 4) : '')); tdT.appendChild(z); }
      tr.append(el('td', 'pm-txt', r.nome), tdS, el('td', '', int.format(r.e0)), el('td', '', int.format(r.v)), el('td', '', int.format(r.e1)), tdC, tdT);
      return tr;
    });
    document.querySelector('#est-promo tbody').replaceChildren(...body);
    document.getElementById('est-promo-titulo').textContent = 'Estoque para ação promocional em ' + nm;
    document.getElementById('est-promo-nota').textContent = `${st.pe ? 'Só a estampa ' + st.pe + (st.pv === 'estampa' ? ', por produto' : '') + '. ' : ''}Do que mais vende para o que menos vende (vendas dos últimos meses). ${inicio} = o que deve sobrar depois da venda prevista até lá, sem contar compras novas. Cobertura no começo = quantos dias esse estoque dura no ritmo previsto para ${nm}. Boa opção: cobertura de 60 dias ou mais e pelo menos 70% dos tamanhos com estoque até o fim do mês. Evitar: menos de 30 dias ou mais da metade dos tamanhos zerando. Uma promoção vende acima da previsão, então prefira as boas opções. Inclui todos os produtos ativos (também calças, moletons e Copa do Mundo); só vendas do site.`;
  }

  // ---------- Escritório × Correios: transferência para o Mercado Livre ----------
  // O escritório abastece o Mercado Livre; o grosso do estoque fica nos Correios (Log + Floripa). Para cada código do
  // Bling vendido no ML nos últimos 28 dias: venda prevista no ML para os próximos N dias = venda diária dos 28 dias ×
  // fator de sazonalidade (venda prevista da loja nos N dias ÷ venda real da loja nos 28 dias, entre 0,5 e 3) × (1 + ousadia).
  // Transferir = previsão arredondada (mínimo 1) − estoque do escritório, limitado ao que existe nos Correios.
  function diasAteDomingo(iso) { const d = new Date(iso + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : 7 - d; }
  function drawML() {
    const card = document.getElementById('est-ml-card'); if (!card) return;
    const B = DADOS.estoque_bling, M = DADOS.ml_vendas;
    if (!B || !B.depositos || !M || !Array.isArray(M.pedidos)) { card.hidden = true; return; }
    card.hidden = false;
    if (!st.mlN) st.mlN = 30; // padrão: 30 dias de cobertura no escritório
    const N = st.mlN, RESERVA = st.mlRes;
    document.getElementById('est-ml-dias').value = N;
    document.getElementById('est-ml-reserva').value = RESERVA;
    const T = P.transferenciaML(DADOS, R, { dias: N, reserva: RESERVA });
    const { saz, mult, ini, fim, ate, AN, MIN, MIN_VENDA } = T;
    // estampa de cada código do Bling: pelo SKU do Shopify; se não achar, pelo nome
    if (!st.mlEst || st.mlEst.R !== R) { const m = new Map(); for (const i of R.itens) for (const k of i.skus || []) m.set(String(k).toUpperCase(), i.estampa); st.mlEst = { R, m }; }
    for (const r of T.rows) r.estampa = st.mlEst.m.get(String(r.k).toUpperCase()) || P.estampa(r.nome);
    st.me = encheEstampas('est-ml-estampa', T.rows, st.me);
    let rows = st.me ? T.rows.filter((r) => r.estampa === st.me) : T.rows;
    const totT = rows.reduce((a, r) => a + (r.transf || 0), 0), nT = rows.filter((r) => r.transf > 0).length;
    const semTudo = rows.filter((r) => r.curto > 0), divs = rows.filter((r) => r.dividido);
    const cols = [['Peça (código no Bling)', 1], ['Venda ML 28 dias', 0], ['Previsão ML até ' + dataCurta(ate), 0], ['Mínimo no escritório', 0], ['Escritório', 0], ['Correios', 0], ['Transferir', 0]];
    document.querySelector('#est-ml thead tr').replaceChildren(...cols.map(([t, tx]) => { const th = el('th', tx ? 'pm-txt' : ''); const sp = el('span', '', t); sp.style.cssText = 'display:block;padding:var(--cds-pad-xs) var(--cds-pad-sm);white-space:nowrap'; th.appendChild(sp); return th; }));
    const body = rows.map((r) => {
      const tr = el('tr');
      const tdN = el('td', 'pm-txt', r.nome); tdN.appendChild(el('small', 'pm-sub', r.k));
      const tdP = el('td', '', r.v > 0 ? (r.prev < 10 ? r.prev.toFixed(1).replace('.', ',') : int.format(r.prev)) : '—');
      const tdM = el('td', '', int.format(r.alvo)); tdM.appendChild(el('small', 'pm-sub', r.alvo > r.minBase ? (r.subiu ? 'pela previsão · vendas subindo' : 'pela previsão') : r.novoML ? 'estoque inicial (novo no ML)' : r.v > 0 ? 'vendeu no ML' : 'sem venda no ML'));
      const tdE = el('td', '', r.esc == null ? '—' : int.format(r.esc)); if (r.esc != null && r.esc < r.alvo) tdE.classList.add(r.esc === 0 ? 'pm-bad' : 'pm-warn');
      const tdC = el('td', '', r.cor == null ? '—' : int.format(r.cor));
      const tdT = el('td', '', r.transf == null ? 'sem dado no Bling' : r.transf > 0 ? int.format(r.transf) : '—'); if (r.transf > 0) tdT.style.fontWeight = 'var(--cds-font-weight-medium)';
      if (r.dividido) tdT.appendChild(el('small', 'pm-sub pm-warn', (r.v > 0 ? 'dividido com o site' : 'fica para o site') + ' (vende ~' + int.format(Math.max(1, Math.round(r.sd * RESERVA))) + ' em ' + RESERVA + ' dias)'));
      if (r.curto > 0) { const s = el('small', 'pm-sub pm-bad', r.cor === 0 && r.esc === 0 ? 'sem estoque nos dois' : 'faltam ' + int.format(r.curto) + ' (Correios não tem)'); tdT.appendChild(s); }
      const tdV = el('td', '', r.v ? int.format(r.v) : '—'); if (r.w) tdV.appendChild(el('small', 'pm-sub' + (r.subiu ? ' pm-warn' : ''), int.format(r.w) + ' nos últimos 7 dias'));
      tr.append(tdN, tdV, tdP, tdM, tdE, tdC, tdT);
      return tr;
    });
    if (!body.length) { const tr = el('tr'); const td = el('td', 'pm-txt', 'Nada a transferir: o escritório já está no mínimo.'); td.colSpan = cols.length; tr.appendChild(td); body.push(tr); }
    document.querySelector('#est-ml tbody').replaceChildren(...body);
    // texto para o WhatsApp: produto com tamanho e quantidade a transferir
    const curtoNome = (n) => n.replace(/\s*(Tam\.?|Tamanho)\s*:\s*/gi, ' ').replace(/Cor( Ribana)?\s*:\s*/gi, '').replace(/;/g, ' ').replace(/\s+/g, ' ').trim();
    const lista = rows.filter((r) => r.transf > 0).map((r) => [curtoNome(r.nome), r.transf]).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    st.mlTexto = lista.length ? `*Transferir Correios → Escritório*${st.me ? ' - ' + st.me : ''} (cobre o ML até ${dataCurta(ate)})\n\n` + lista.map(([n, q]) => `${n} — ${q}`).join('\n') + `\n\n*Total: ${int.format(lista.reduce((a, x) => a + x[1], 0))} peças*` : 'Nada a transferir dos Correios para o escritório.';
    document.getElementById('est-ml-texto').hidden = true; document.getElementById('est-ml-copiado').textContent = '';
    const res = document.getElementById('est-ml-resumo'); res.replaceChildren();
    res.append((st.me ? 'Estampa ' + st.me + ': t' : 'T') + 'ransferir dos Correios para o escritório: ', el('strong', '', int.format(totT) + ' peças'), ' em ' + int.format(nT) + ' peças/tamanhos, para o escritório ficar com o mínimo (2 de cada; 3 do que vendeu no ML) e cobrir o Mercado Livre até ' + dataBR(ate) + ' (' + N + ' dias).' + (divs.length ? ' ' + divs.length + (divs.length === 1 ? ' peça foi dividida' : ' peças foram divididas') + ' com o site porque os Correios não têm o suficiente para os dois canais.' : '') + (semTudo.length ? ' ' + semTudo.length + (semTudo.length === 1 ? ' peça não tem' : ' peças não têm') + ' estoque suficiente nem somando os dois depósitos.' : ''));
    const lido = new Date(B.gerado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    document.getElementById('est-ml-nota').textContent = `O escritório abastece as vendas do Mercado Livre; o resto do estoque fica nos Correios (Log + Floripa). Estoque por depósito lido no Bling em ${lido}. Venda do ML: pedidos da loja Mercado Livre no Bling de ${dataCurta(ini)} a ${dataCurta(fim)} (sem cancelados). Só entram as peças do sortimento do ML: as da planilha de anúncios do ML${AN && AN.importedAt ? ' (importada em ' + new Date(AN.importedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' na aba Precificação)' : ' (aba Precificação)'} e as que já venderam no ML.`;
    document.getElementById('est-ml-rodape').textContent = `Previsão ML = venda por dia no ML (média dos últimos 28 dias; se a última semana vendeu mais, ela conta em dobro, para pegar o que está acelerando) × ${saz.toFixed(2).replace('.', ',')} (sazonalidade: a loja deve vender ${saz >= 1 ? 'mais' : 'menos'} por dia nos próximos ${N} dias do que vendeu nos últimos 28) × ${mult.toFixed(2).replace('.', ',')} (margem) × ${N} dias. Mínimo no escritório = 2 de cada peça e tamanho; 3 se vendeu no ML nos últimos 28 dias; peças novas no ML (Tangram, Arvoredo, Sorvete, Dinos e Obras de Arte) começam com 2-3-3-3-2 nos tamanhos 02 a 10; ou a previsão arredondada para cima, se for maior: quem tende a vender mais fica com mais no escritório. Transferir = o que falta no escritório para chegar ao mínimo, até o que existe nos Correios. Os Correios guardam a venda prevista do site para ${RESERVA} dias (cobertura do site); quando o estoque não dá para os dois canais, ele é dividido na proporção da venda de cada um (ML × site), e o que não vende no ML fica para o site. As de 6 e 12 canetinhas contam como uma.`;
  }
  function janela() {
    document.getElementById('est-janela').textContent = `Previsão feita com a venda do site fechada até ${dataBR(ref)} e o estoque do fim desse dia.`;
  }

  function desenha() { if (!DADOS || document.getElementById('aba-estoque').hidden) return; if (!R) calcula(); janela(); drawTabela(); drawPromo(); drawML(); drawPremissas(); }
  window.drawEstoque = desenha;
  window.EstoqueAba = {
    define(D) { DADOS = D; ref = D.referencia; mesRef = ref.slice(0, 7); R = null; desenha(); if (window.CompraAba) window.CompraAba.desenha(); },
    carregado: () => !!DADOS,
    // para a aba Compra: peças fora da lista de exclusão, com a situação de cada uma
    resultado() { if (!DADOS) return null; if (!R) calcula(); return { R, itens: R.itens.filter((i) => !fora(i)).map((i) => ({ ...i, status: status(i) })), prazo: st.prazo, cobertura: st.cobertura, ref, fotos: (DADOS.estoque_bling && DADOS.estoque_bling.fotos) || null }; },
  };

  document.getElementById('est-prazo').value = st.prazo; document.getElementById('est-cobertura').value = st.cobertura;
  const muda = () => { const p = +document.getElementById('est-prazo').value, c = +document.getElementById('est-cobertura').value; if (!(p >= 0 && c >= 0)) return; st.prazo = Math.min(365, p); st.cobertura = Math.min(365, c); guarda.grava('prazo2', st.prazo); guarda.grava('cobertura', st.cobertura); if (DADOS) { calcula(); desenha(); if (window.CompraAba) window.CompraAba.marcarVelho(); } };
  document.getElementById('est-prazo').addEventListener('change', muda); document.getElementById('est-cobertura').addEventListener('change', muda);
  document.getElementById('est-promo-estampa').addEventListener('change', (e) => { st.pe = e.target.value; guarda.grava('pestampa', st.pe); drawPromo(); });
  document.getElementById('est-ml-estampa').addEventListener('change', (e) => { st.me = e.target.value; guarda.grava('mlestampa', st.me); drawML(); });
  document.getElementById('est-estampa').addEventListener('change', (e) => { st.e = e.target.value; guarda.grava('estampa', st.e); st.abertos.clear(); drawTabela(); });
  document.getElementById('est-promo-visao').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.pv = b.dataset.v; guarda.grava('pvisao', st.pv); drawPromo(); } });
  document.getElementById('est-seg-filtro').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.f = b.dataset.f; drawTabela(); } });
  document.getElementById('est-ml-reserva').addEventListener('change', (e) => { const n = Math.round(+e.target.value); if (n >= 0 && n <= 120) { st.mlRes = n; drawML(); } });
  document.getElementById('est-ml-copiar').addEventListener('click', async () => {
    const t = st.mlTexto || '', msg = document.getElementById('est-ml-copiado'), ta = document.getElementById('est-ml-texto');
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (e) { /* sem acesso à área de transferência */ }
    if (!ok) { try { ta.value = t; ta.hidden = false; ta.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; } }
    if (ok) { msg.textContent = 'Copiado! É só colar no WhatsApp.'; ta.hidden = true; }
    else { ta.value = t; ta.hidden = false; ta.focus(); ta.select(); msg.textContent = 'Não deu para copiar sozinho: o texto está selecionado abaixo, copie com Ctrl+C (ou segure e copie no celular).'; }
  });
  document.getElementById('est-ml-dias').addEventListener('change', (e) => { const n = Math.round(+e.target.value); if (n >= 1 && n <= 60) { st.mlN = n; drawML(); } });
  document.getElementById('est-busca').addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); drawTabela(); });
  document.getElementById('abas').addEventListener('click', () => setTimeout(desenha, 0));
})();
