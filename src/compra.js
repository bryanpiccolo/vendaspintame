// Aba "Compra": escolher quantas peças comprar (a partir da sugestão da aba Estoque) e calcular o tecido.
// Usa window.EstoqueAba.resultado() e window.FICHAS / window.fichaDe (src/fichas.js).
(function () {
  const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const dec = (n) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: n, maximumFractionDigits: n });
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const dataBR = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const CHAVE = 'pm-compra-v1';
  const le = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (e) { return {}; } };
  const grava = (o) => { try { localStorage.setItem(CHAVE, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } };
  const ordTam = (t) => { if (/^\d+$/.test(t)) return [0, +t]; const L = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG']; const i = L.indexOf(t); return i >= 0 ? [1, i] : [2, 0]; };
  const cmpTam = (a, b) => { const A = ordTam(a), B = ordTam(b); return A[0] - B[0] || A[1] - B[1] || String(a).localeCompare(String(b)); };

  // Códigos: SKU da variante de 6 canetinhas em cada tamanho; código do produto = começo comum dos SKUs.
  const skuPeca = (i) => { const s = i.skus || []; return s.find((x) => /(\s0?6|\d{2}06)$/.test(x.trim())) || s[0] || ''; };
  const codProduto = (its) => {
    const s = [...new Set(its.flatMap((i) => i.skus || []).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean))];
    if (!s.length) return '';
    if (s.every((x) => / /.test(x))) {
      const toks = s.map((x) => x.split(' ')), out = [];
      for (let k = 0; k < toks[0].length; k++) { const t = toks[0][k].toUpperCase(); if (toks.every((a) => (a[k] || '').toUpperCase() === t)) out.push(toks[0][k]); else break; }
      while (s.length === 1 && out.length > 1 && /^\d+$/.test(out[out.length - 1])) out.pop();
      if (out.length && /^k$/i.test(out[0])) out.shift();
      return out.join(' ');
    }
    let p = s.reduce((a, b) => { let k = 0; while (k < a.length && k < b.length && a[k].toUpperCase() === b[k].toUpperCase()) k++; return a.slice(0, k); });
    p = s.length === 1 ? p.replace(/\d{4}$/, '') : p.replace(/\d+$/, '');
    return p.replace(/^k/i, '');
  };
  const fichaPor = (cod, produto) => (cod && window.FICHAS.find((f) => f.sku.replace(/\s/g, '').toUpperCase() === cod.replace(/\s/g, '').toUpperCase())) || window.fichaDe(produto);

  const st = { f: 'ficha', q: '', qtd: le() };
  const hist = [];
  const mudar = (fn) => { hist.push(JSON.stringify(st.qtd)); if (hist.length > 100) hist.shift(); fn(); grava(st.qtd); };
  let base = null;

  function itens() {
    const r = window.EstoqueAba && window.EstoqueAba.resultado();
    if (!r) return null;
    base = r;
    const porProd = new Map(); for (const i of r.itens) { if (!porProd.has(i.produto)) porProd.set(i.produto, []); porProd.get(i.produto).push(i); }
    const cods = new Map([...porProd.entries()].map(([p, its]) => [p, codProduto(its)]));
    return r.itens.map((i) => ({ ...i, codigo: cods.get(i.produto) || '', sku: skuPeca(i), ficha: fichaPor(cods.get(i.produto), i.produto) })).filter((i) => i.share > 0 || i.comprar > 0 || i.ficha || st.qtd[i.id] > 0);
  }

  function totais(lista) {
    const mat = new Map(), mao = new Map(), grade = new Map();
    let pecas = 0, semFicha = 0;
    for (const i of lista) {
      const q = +st.qtd[i.id] || 0;
      if (!q) continue;
      pecas += q;
      if (!i.ficha) { semFicha += q; continue; }
      const g = grade.get(i.ficha.sku) || { ficha: i.ficha, tam: new Map(), total: 0 };
      g.tam.set(i.tamanho, (g.tam.get(i.tamanho) || 0) + q); g.total += q; grade.set(i.ficha.sku, g);
      for (const m of i.ficha.materiais) {
        const a = mat.get(m.insumo) || { ...m, qtd: 0, custo: 0, modelos: new Set() };
        a.qtd += q * m.porPeca; a.custo += q * m.porPeca * m.preco; a.modelos.add(i.ficha.sku); mat.set(m.insumo, a);
      }
      for (const e of i.ficha.mao) { const a = mao.get(e.etapa) || { etapa: e.etapa, custo: 0 }; a.custo += q * e.preco; mao.set(e.etapa, a); }
    }
    const lm = [...mat.values()];
    const TE = window.TECIDO_ESTAMPADO;
    for (const m of lm) if (m.estampa) {
      m.kgNec = m.qtd / TE.mPorKg;
      m.rolos = Math.max(TE.minRolos, Math.ceil(m.kgNec / TE.kgRolo - 1e-9));
      m.kgCompra = m.rolos * TE.kgRolo; m.mCompra = m.kgCompra * TE.mPorKg; m.sobra = m.mCompra - m.qtd;
      m.custoPedido = m.kgCompra * TE.precoKg; m.minimo = Math.ceil(m.kgNec / TE.kgRolo - 1e-9) < TE.minRolos;
    } else m.custoPedido = m.custo;
    return { pecas, semFicha, tecidos: lm.filter((m) => m.tecido).sort((a, b) => (b.estampa - a.estampa) || b.custo - a.custo), aviamentos: lm.filter((m) => !m.tecido), mao: [...mao.values()], grade: [...grade.values()] };
  }

  function card(box, rot, val, sub) { const d = el('div', 'pm-kpi'); d.append(el('div', 'pm-kpi-label', rot), el('div', 'pm-kpi-value', val), el('div', 'pm-kpi-delta', sub || '')); box.appendChild(d); }

  function desenha() {
    const aba = document.getElementById('aba-compra');
    if (!aba || aba.hidden) return;
    const lista = itens();
    if (!lista) return;
    const bd = document.getElementById('compra-desfazer'); bd.disabled = !hist.length; bd.textContent = hist.length ? 'Desfazer (' + hist.length + ')' : 'Desfazer';
    document.querySelectorAll('#compra-seg-filtro button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === st.f)));
    document.getElementById('compra-janela').textContent = `Sugestão da aba Estoque com a venda até ${dataBR(base.ref)}: compra que chega em ${base.prazo} dias e cobre ${base.cobertura} dias depois da chegada.`;
    const T = totais(lista);
    const custoMat = T.tecidos.reduce((a, m) => a + m.custoPedido, 0) + T.aviamentos.reduce((a, m) => a + m.custo, 0), custoMao = T.mao.reduce((a, m) => a + m.custo, 0);
    const box = document.getElementById('compra-cards'); box.replaceChildren();
    card(box, 'Peças que vamos comprar', int.format(T.pecas), T.semFicha ? int.format(T.semFicha) + ' sem ficha técnica' : 'todas com ficha técnica');
    const est = T.tecidos.filter((m) => m.estampa);
    card(box, 'Rolos de tecido estampado', int.format(est.reduce((a, m) => a + m.rolos, 0)), est.length ? int.format(est.reduce((a, m) => a + m.kgCompra, 0)) + ' kg em ' + est.length + ' estampas' : 'nenhuma estampa');
    card(box, 'Pedido de tecidos', brl.format(T.tecidos.reduce((a, m) => a + m.custoPedido, 0)), 'rolos inteiros + ribanas e tule');
    card(box, 'Custo total estimado', brl.format(custoMat + custoMao), T.pecas - T.semFicha > 0 ? brl.format((custoMat + custoMao) / (T.pecas - T.semFicha)) + ' por peça (com ficha, rolos inteiros)' : '');
    tabela(lista);
    ordem(T, custoMat, custoMao);
  }

  function tabela(lista) {
    let rows = lista;
    if (st.f === 'ficha') rows = rows.filter((i) => i.ficha);
    else if (st.f === 'sugestao') rows = rows.filter((i) => i.comprar > 0);
    else rows = rows.filter((i) => +st.qtd[i.id] > 0);
    if (st.q) rows = rows.filter((i) => (i.produto + ' ' + i.tamanho + ' ' + i.codigo + ' ' + i.sku + ' ' + (i.ficha ? i.ficha.sku : '')).toLowerCase().includes(st.q));
    const porProd = new Map();
    for (const i of rows) { const k = i.produto; if (!porProd.has(k)) porProd.set(k, []); porProd.get(k).push(i); }
    const prods = [...porProd.entries()].map(([p, its]) => ({ p, its: its.sort((a, b) => cmpTam(a.tamanho, b.tamanho)), vj: its.reduce((a, b) => a + b.vendas_janela, 0), ficha: its[0].ficha, codigo: its[0].codigo }))
      .sort((a, b) => b.vj - a.vj);
    const table = document.getElementById('compra-tabela');
    const hr = table.querySelector('thead tr'); hr.replaceChildren();
    for (const [t, txt] of [['Produto / tamanho', 1], ['Código', 1], ['Estoque hoje', 0], ['Acaba em', 0], ['Sugestão', 0], ['Vamos comprar', 0], ['Tecido (m)', 0]]) hr.appendChild(el('th', txt ? 'pm-txt' : '', t));
    document.getElementById('compra-nota').textContent = 'Digite quantas peças de cada tamanho vão ser compradas. A sugestão vem da aba Estoque (venda prevista × sell-through − sobra de estoque). Ordenado do produto que mais vende para o que menos vende.';
    const body = [];
    const tecidoPeca = (f) => f ? f.materiais.filter((m) => m.tecido && m.unidade === 'm').reduce((a, m) => a + m.porPeca, 0) : 0;
    for (const g of prods) {
      const tot = g.its.reduce((a, i) => a + (+st.qtd[i.id] || 0), 0), sug = g.its.reduce((a, i) => a + i.comprar, 0);
      const tr = el('tr', 'pm-cab');
      tr.append(el('td', 'pm-txt', g.p), el('td', 'pm-txt', (g.codigo || (g.ficha ? g.ficha.sku : '—')) + (g.ficha ? '' : ' · sem ficha')), el('td', '', int.format(g.its.reduce((a, i) => a + Math.max(0, i.estoque), 0))), el('td', '', ''), el('td', '', sug ? int.format(sug) : '—'), el('td', '', tot ? int.format(tot) : '—'), el('td', '', tot && g.ficha ? dec(1).format(tot * tecidoPeca(g.ficha)) : '—'));
      body.push(tr);
      for (const i of g.its) {
        const r = el('tr');
        const q = +st.qtd[i.id] || 0;
        const inp = el('input', 'pm-qtd' + (q ? ' pm-on' : '')); inp.type = 'number'; inp.min = '0'; inp.step = '1'; inp.inputMode = 'numeric'; inp.value = q ? String(q) : ''; inp.placeholder = '0';
        inp.setAttribute('aria-label', 'Quantidade a comprar de ' + i.produto + ' tamanho ' + i.tamanho);
        inp.addEventListener('change', () => { const v = Math.max(0, Math.round(+inp.value || 0)); if (v === (+st.qtd[i.id] || 0)) return; mudar(() => { if (v) st.qtd[i.id] = v; else delete st.qtd[i.id]; }); setTimeout(desenha, 0); });
        const tdq = el('td'); tdq.appendChild(inp);
        const rup = i.ruptura === 'agora' ? 'sem estoque' : i.ruptura ? dataBR(i.ruptura) : '—';
        const tdr = el('td', '', rup); if (i.ruptura && (i.ruptura === 'agora' || i.status === 'urgente')) tdr.classList.add('pm-bad');
        r.append(el('td', 'pm-txt', 'Tamanho ' + i.tamanho), el('td', 'pm-txt', i.sku || '—'), el('td', '', int.format(Math.max(0, i.estoque))), tdr, el('td', '', i.comprar ? int.format(i.comprar) : '—'), tdq, el('td', '', q && i.ficha ? dec(1).format(q * tecidoPeca(i.ficha)) : '—'));
        r.firstChild.style.paddingLeft = '1.4rem';
        body.push(r);
      }
    }
    if (!body.length) { const tr = el('tr'); const td = el('td', 'pm-txt', st.f === 'escolhidos' ? 'Nenhuma quantidade preenchida ainda.' : 'Nada encontrado.'); td.colSpan = 7; tr.appendChild(td); body.push(tr); }
    table.querySelector('tbody').replaceChildren(...body);
  }

  function linhaTab(id, cab, linhas) {
    const t = document.getElementById(id), hr = t.querySelector('thead tr'); hr.replaceChildren();
    cab.forEach(([c, txt]) => hr.appendChild(el('th', txt ? 'pm-txt' : '', c)));
    t.querySelector('tbody').replaceChildren(...linhas.map((cells) => { const tr = el('tr', cells.cls || ''); cells.forEach(([v, txt]) => tr.appendChild(el('td', txt ? 'pm-txt' : '', v))); return tr; }));
  }

  function ordem(T, custoMat, custoMao) {
    document.getElementById('compra-ordem-nota').textContent = T.pecas ? `Soma do consumo das ${int.format(T.pecas - T.semFicha)} peças com ficha técnica. A mesma estampa usada em modelos diferentes aparece numa linha só e é arredondada para rolos inteiros.` : 'Preencha as quantidades acima para montar o pedido.';
    const un = (m) => m.unidade === 'm' ? dec(2).format(m.qtd) + ' m' : int.format(Math.ceil(m.qtd)) + ' ' + m.unidade;
    const TE = window.TECIDO_ESTAMPADO;
    const tec = T.tecidos.map((m) => m.estampa
      ? [[m.insumo.replace(/^Tecido /, 'Estampa '), 1], [m.codigo, 1], [[...m.modelos].join(', '), 1], [dec(1).format(m.qtd) + ' m', 0], [int.format(m.rolos) + (m.minimo ? ' (mín.)' : ''), 0], [int.format(m.kgCompra) + ' kg · ' + dec(1).format(m.mCompra) + ' m', 0], [dec(1).format(m.sobra) + ' m' + (m.modelos.size === 1 && m.porPeca ? ' (≈ ' + int.format(Math.floor(m.sobra / m.porPeca)) + ' peças)' : ''), 0], [brl.format(m.custoPedido), 0]]
      : [[m.insumo, 1], ['a informar', 1], [[...m.modelos].join(', '), 1], [un(m), 0], ['—', 0], [un(m), 0], ['—', 0], [brl.format(m.custoPedido), 0]]);
    if (T.tecidos.length) { const l = [['Total', 1], ['', 1], ['', 1], ['', 0], [int.format(T.tecidos.filter((m) => m.estampa).reduce((a, m) => a + m.rolos, 0)) + ' rolos', 0], ['', 0], ['', 0], [brl.format(T.tecidos.reduce((a, m) => a + m.custoPedido, 0)), 0]]; l.cls = 'pm-cab'; tec.push(l); }
    linhaTab('compra-tecidos', [['Tecido', 1], ['Código', 1], ['Modelos', 1], ['Necessário', 0], ['Rolos', 0], ['Comprar', 0], ['Sobra', 0], ['Custo', 0]], tec.length ? tec : [[['—', 1], ['', 1], ['', 1], ['', 0], ['', 0], ['', 0], ['', 0], ['', 0]]]);
    document.getElementById('compra-premissa').textContent = `Tecido estampado: ${TE.nome}, código ${TE.codigo}, fornecedor ${TE.fornecedor}, largura ${dec(2).format(TE.largura)} m, ${TE.gramatura} g/m². Comprado em rolos de ${TE.kgRolo} kg (1 kg = ${dec(2).format(TE.mPorKg)} m, um rolo ≈ ${dec(1).format(TE.kgRolo * TE.mPorKg)} m), mínimo de ${TE.minRolos} rolos por estampa, a ${brl.format(TE.precoKg)} o kg (${brl.format(TE.precoKg / TE.mPorKg)} o metro). Ribanas e tule saem em metros pelo preço da ficha.`;
    const tams = [...new Set(T.grade.flatMap((g) => [...g.tam.keys()]))].sort(cmpTam);
    const gr = T.grade.map((g) => [[g.ficha.sku + ' · ' + g.ficha.nome, 1], ...tams.map((t) => [g.tam.get(t) ? int.format(g.tam.get(t)) : '', 0]), [int.format(g.total), 0]]);
    linhaTab('compra-grade', [['Modelo', 1], ...tams.map((t) => [t, 0]), ['Total', 0]], gr.length ? gr : [[['—', 1]]]);
    const av = T.aviamentos.map((m) => [[m.insumo, 1], [un(m), 0], [brl.format(m.custo), 0]]);
    T.mao.forEach((m) => av.push([['Mão de obra: ' + m.etapa.toLowerCase(), 1], ['', 0], [brl.format(m.custo), 0]]));
    if (av.length) { const l = [['Total (tecidos + aviamentos + mão de obra)', 1], ['', 0], [brl.format(custoMat + custoMao), 0]]; l.cls = 'pm-cab'; av.push(l); }
    linhaTab('compra-aviamentos', [['Item', 1], ['Quantidade', 0], ['Custo', 0]], av.length ? av : [[['—', 1], ['', 0], ['', 0]]]);
    ordem.T = T;
  }

  const msg = (t) => { const m = document.getElementById('compra-msg'); m.textContent = t; setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 4000); };
  function textoPedido() {
    const T = ordem.T; if (!T || !T.tecidos.length) return '';
    const hoje = new Date().toLocaleDateString('pt-BR');
    const l = [`PINTA ME - Pedido de tecidos - ${hoje}`, ''];
    const TE = window.TECIDO_ESTAMPADO;
    const est = T.tecidos.filter((m) => m.estampa), out = T.tecidos.filter((m) => !m.estampa);
    if (est.length) {
      l.push(`${TE.fornecedor} - ${TE.nome} - código ${TE.codigo} (rolos de ${TE.kgRolo} kg)`);
      for (const m of est) l.push(`- ${m.insumo.replace(/^Tecido /, 'Estampa ')}: ${m.rolos} rolos = ${int.format(m.kgCompra)} kg (aprox. ${dec(1).format(m.mCompra)} m)`);
      l.push(`Total: ${est.reduce((a, m) => a + m.rolos, 0)} rolos = ${int.format(est.reduce((a, m) => a + m.kgCompra, 0))} kg`, '');
    }
    if (out.length) { l.push('Ribanas e tule:'); for (const m of out) l.push(`- ${m.insumo}: ${dec(2).format(m.qtd)} m`); }
    l.push('', 'Peças por modelo:');
    for (const g of T.grade) l.push(`${g.ficha.sku} ${g.ficha.nome}: ${[...g.tam.entries()].sort((a, b) => cmpTam(a[0], b[0])).map(([t, q]) => t + ': ' + q).join(', ')} (total ${g.total})`);
    return l.join('\n');
  }
  function csv() {
    const T = ordem.T; if (!T) return '';
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const n = (v, d) => String((+v).toFixed(d)).replace('.', ',');
    const l = [['tipo', 'item', 'codigo', 'modelos', 'necessario', 'unidade', 'rolos', 'comprar_kg', 'comprar_m', 'sobra_m', 'preco', 'custo'].join(';')];
    for (const m of T.tecidos) l.push([m.estampa ? 'tecido estampado' : 'tecido', m.insumo, m.codigo || '', [...m.modelos].join(' '), n(m.qtd, 2), m.unidade, m.estampa ? m.rolos : '', m.estampa ? n(m.kgCompra, 0) : '', m.estampa ? n(m.mCompra, 2) : n(m.qtd, 2), m.estampa ? n(m.sobra, 2) : '', m.estampa ? n(window.TECIDO_ESTAMPADO.precoKg, 2) + '/kg' : n(m.preco, 2) + '/m', n(m.custoPedido, 2)].map(q).join(';'));
    for (const m of T.aviamentos) l.push(['aviamento', m.insumo, '', [...m.modelos].join(' '), n(m.qtd, 0), m.unidade, '', '', '', '', n(m.preco, 4), n(m.custo, 2)].map(q).join(';'));
    for (const m of T.mao) l.push(['mao de obra', m.etapa, '', '', '', '', '', '', '', '', '', n(m.custo, 2)].map(q).join(';'));
    l.push('');
    l.push(['modelo', 'tamanho', 'pecas'].join(';'));
    for (const g of T.grade) for (const [t, v] of [...g.tam.entries()].sort((a, b) => cmpTam(a[0], b[0]))) l.push([g.ficha.sku, t, v].map(q).join(';'));
    return '﻿' + l.join('\r\n');
  }

  document.getElementById('compra-seg-filtro').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.f = b.dataset.f; desenha(); } });
  document.getElementById('compra-busca').addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); desenha(); });
  document.getElementById('compra-preencher').addEventListener('click', () => {
    const lista = itens(); if (!lista) return;
    let n = 0; mudar(() => { for (const i of lista) if (i.comprar > 0 && (st.f !== 'ficha' || i.ficha) && !(st.qtd[i.id] > 0)) { st.qtd[i.id] = i.comprar; n++; } }); if (!n) hist.pop(); desenha(); msg(n ? n + ' tamanhos preenchidos com a sugestão' : 'Nada para preencher');
  });
  document.getElementById('compra-limpar').addEventListener('click', () => { if (!Object.keys(st.qtd).length) return; mudar(() => { st.qtd = {}; }); desenha(); msg('Lista limpa (dá para desfazer)'); });
  document.getElementById('compra-desfazer').addEventListener('click', () => { if (!hist.length) { msg('Nada para desfazer'); return; } st.qtd = JSON.parse(hist.pop()); grava(st.qtd); desenha(); msg('Última alteração desfeita'); });
  document.getElementById('compra-copiar').addEventListener('click', async () => {
    const t = textoPedido(); if (!t) { msg('Preencha as quantidades primeiro'); return; }
    try { await navigator.clipboard.writeText(t); msg('Pedido copiado'); }
    catch (e) { const ta = el('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); msg('Pedido copiado'); } catch (e2) { msg('Não foi possível copiar'); } ta.remove(); }
  });
  document.getElementById('compra-csv').addEventListener('click', () => {
    const c = csv(); if (!ordem.T || !ordem.T.pecas) { msg('Preencha as quantidades primeiro'); return; }
    try { const a = el('a'); a.href = URL.createObjectURL(new Blob([c], { type: 'text/csv;charset=utf-8' })); a.download = 'pedido-tecidos-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); msg('Planilha baixada'); }
    catch (e) { msg('Não foi possível baixar aqui; use Copiar'); }
  });
  document.getElementById('compra-imprimir').addEventListener('click', () => { try { window.print(); } catch (e) { msg('Impressão indisponível aqui'); } });
  document.getElementById('abas').addEventListener('click', () => setTimeout(desenha, 0));

  window.CompraAba = { desenha, marcarVelho() { desenha(); } };
  setTimeout(desenha, 0);
})();
