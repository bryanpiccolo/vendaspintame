// Análise automática (manter / ajustar) das abas Vendas por produto, Vendas por estado e Estoque.
// Regras fixas sobre os números que estão na tela; refaz a leitura sempre que a seleção muda.
(function () {
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const pct = (v) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }).format(v);
  const pct1 = (v) => new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  const var_ = (v) => (v > 0 ? '+' : '') + pct(v);
  const pp = (v) => (v > 0 ? '+' : '−') + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(v * 100)) + ' p.p.';
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const curto = (s, n = 46) => { s = String(s || '').replace(/ Infantil para Colorir| para Colorir| \+ 6 canetinhas|\+ 6 canetinhas/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const nomeLinha = (r) => [r.estampa, r.categoria, r.produto && curto(r.produto), r.tamanho && (r.produto || r.estampa || r.categoria ? 'tam. ' + r.tamanho : 'Tamanho ' + r.tamanho)].filter(Boolean).join(' · ');
  const lista = (arr, f, n = 3) => arr.slice(0, n).map(f).join('; ');
  const addMes = (k, n) => { let [y, m] = k.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); };
  const media = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

  // ---------- desenho ----------
  const css = el('style');
  css.textContent = '.pm-analise{border-left:3px solid var(--color-fg)}.pm-analise .pm-an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:var(--cds-gap-lg)}.pm-analise h3{font-size:var(--cds-font-size-body);margin:0 0 var(--cds-gap-sm);display:flex;align-items:center;gap:.4rem}.pm-analise h3 i{width:.6rem;height:.6rem;border-radius:50%;display:inline-block}.pm-analise ul{margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:.55rem;font-size:var(--cds-font-size-caption);line-height:1.5}.pm-analise li b{font-weight:var(--cds-font-weight-medium)}.pm-analise .pm-acao{display:block;color:var(--color-fg-muted)}.pm-analise .pm-vazio{color:var(--color-fg-muted);list-style:none;margin-left:-1.1rem}';
  document.head.appendChild(css);

  function card(id, antesDe) {
    let c = document.getElementById(id);
    if (c) return c;
    c = el('section', 'pm-card pm-analise'); c.id = id;
    const head = el('div', 'pm-card-head'); const t = el('div'); t.append(el('h2', '', 'Leitura do analista'), el('p', 'pm-note pm-an-sub'));
    head.appendChild(t);
    const grid = el('div', 'pm-an-grid');
    for (const [k, rot, cor] of [['manter', 'Manter (pontos positivos)', 'var(--color-ok)'], ['ajustar', 'Ajustar (pontos de atenção)', 'var(--color-warn)']]) {
      const col = el('div'); const h = el('h3'); const i = el('i'); i.style.background = cor; h.append(i, rot); col.append(h, el('ul', 'pm-an-' + k)); grid.appendChild(col);
    }
    c.append(head, grid);
    antesDe.parentNode.insertBefore(c, antesDe);
    return c;
  }
  function preenche(c, sub, manter, ajustar) {
    c.querySelector('.pm-an-sub').textContent = sub;
    for (const [k, itens, vazio] of [['manter', manter, 'Nenhum destaque positivo forte neste recorte.'], ['ajustar', ajustar, 'Nenhum ponto de atenção relevante neste recorte.']]) {
      const ul = c.querySelector('.pm-an-' + k); ul.replaceChildren();
      if (!itens.length) { ul.appendChild(el('li', 'pm-vazio', vazio)); continue; }
      for (const it of itens.slice(0, 5)) { const li = el('li'); li.appendChild(el('b', '', it.t)); li.appendChild(document.createTextNode(' ' + it.d)); if (it.a) li.appendChild(el('span', 'pm-acao', '→ ' + it.a)); ul.appendChild(li); }
    }
  }

  // ---------- Vendas por produto ----------
  const NOME_VISAO = { produto: 'produto', estampa: 'estampa', categoria: 'categoria', tamanho: 'tamanho', estampa_tamanho: 'estampa e tamanho', categoria_tamanho: 'categoria e tamanho', produto_tamanho: 'produto e tamanho' };
  const MES_NOME = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nomeMes = (m) => MES_NOME[+m.slice(5) - 1] + '/' + m.slice(0, 4);
  const faixaMeses = (ms) => ms.length === 1 ? nomeMes(ms[0]) : nomeMes(ms[0]) + ' a ' + nomeMes(ms[ms.length - 1]);
  function comparaAno(p, dim) {
    const H = window.PM_HIST && window.PM_HIST.fonte();
    if (!Array.isArray(H) || !p || p === 'ontem') return null;
    const PM = window.PM, meses = [];
    if (p.startsWith('m:')) { const m = p.slice(2); if (m >= PM.mesAtual) return null; meses.push(m); }
    else { const y = p.slice(2); for (let i = 1; i <= 12; i++) { const m = y + '-' + String(i).padStart(2, '0'); if (m < PM.mesAtual) meses.push(m); } }
    if (!meses.length) return null;
    const atual = new Set(meses), ant = new Set(meses.map((m) => addMes(m, -12)));
    const a = new Map(), b = new Map();
    for (const r of H) { const inA = atual.has(r.month), inB = ant.has(r.month); if (!inA && !inB) continue; const k = window.PM_HIST.idDe(r, dim); const mp = inA ? a : b; mp.set(k, (mp.get(k) || 0) + r.gmv); }
    return { a, b, meses };
  }
  function analisaProdutos() {
    const PM = window.PM; if (!PM || !PM.L || !PM.L.length) return null;
    const st = PM.st, v = st.v;
    const rows = PM.L.filter((r) => r.dim === v && r.id !== 'total' && r.gmv > 0).sort((x, y) => y.gmv - x.gmv);
    const tot = PM.L.find((r) => r.id === 'total');
    if (!rows.length || !tot) return { sub: 'Sem vendas no período escolhido.', m: [], a: [] };
    const T = rows.reduce((s, r) => s + r.gmv, 0);
    const M = [], A = [];
    // concentração
    const top = rows.slice(0, 3), shTop = top.reduce((s, r) => s + r.gmv, 0) / T;
    M.push({ t: 'Carros-chefe.', d: `${lista(top, (r) => nomeLinha(r) + ' (' + pct(r.gmv / T) + ')')} somam ${pct(shTop)} do GMV.`, a: 'Proteger estoque, foto e posição na vitrine desses itens.' });
    if (rows.length >= 4 && rows[0].gmv / T > 0.35) A.push({ t: 'Dependência alta de um item.', d: `${nomeLinha(rows[0])} sozinho responde por ${pct(rows[0].gmv / T)} do GMV.`, a: 'Testar o 2º e o 3º colocados em mídia e vitrine para diluir o risco.' });
    // margem
    const comMargem = rows.filter((r) => r.margem_pct != null && r.receita > 0);
    const mMed = tot.margem_pct;
    if (mMed != null && comMargem.length >= 3) {
      const boas = comMargem.filter((r) => r.margem_pct >= mMed + 0.05 && r.gmv / T >= 0.03).sort((x, y) => y.gmv - x.gmv);
      if (boas.length) M.push({ t: 'Margem acima da média com volume.', d: `${lista(boas, (r) => nomeLinha(r) + ' (' + pct(r.margem_pct) + ')')}; a média é ${pct(mMed)}.`, a: 'Bons candidatos para receber mais verba de mídia.' });
      const ruins = comMargem.filter((r) => r.margem_pct <= mMed - 0.08 && r.gmv / T >= 0.02).sort((x, y) => x.margem_pct - y.margem_pct);
      if (ruins.length) A.push({ t: 'Margem abaixo da média.', d: `${lista(ruins, (r) => nomeLinha(r) + ' (' + pct(r.margem_pct) + ')')}, contra ${pct(mMed)} da loja.`, a: 'Rever desconto, preço ou custo (ficha técnica) desses itens.' });
    }
    // devoluções
    const devMed = tot.gmv > 0 ? tot.devolucoes / tot.gmv : 0;
    const dev = rows.filter((r) => r.devolucoes >= 200 && r.devolucoes / r.gmv >= Math.max(0.05, devMed * 2)).sort((x, y) => y.devolucoes - x.devolucoes);
    if (dev.length) A.push({ t: 'Devolução acima do normal.', d: `${lista(dev, (r) => nomeLinha(r) + ' (' + pct(r.devolucoes / r.gmv) + ' do GMV)')}; a média é ${pct1(devMed)}.`, a: 'Checar motivos: tamanho, qualidade, foto que não condiz.' });
    else if (devMed > 0 && devMed < 0.03) M.push({ t: 'Devoluções sob controle.', d: `${pct1(devMed)} do GMV no período.` });
    // custo
    if (tot.receita_sem_custo > 0) A.push({ t: 'Venda sem custo cadastrado.', d: `${brl.format(tot.receita_sem_custo)} de receita veio de variantes sem custo no Shopify, o que distorce a margem.`, a: 'Preencher o custo por item dessas variantes.' });
    // ano anterior
    const c = comparaAno(st.tp, v);
    if (c) {
      const comp = rows.map((r) => ({ r, a: c.a.get(r.id) || 0, b: c.b.get(r.id) || 0 })).filter((x) => x.b > 0);
      const TB = [...c.b.values()].reduce((s, x) => s + x, 0);
      const sobe = comp.filter((x) => x.a / x.b - 1 >= 0.2 && x.a >= T * 0.02).sort((x, y) => (y.a - y.b) - (x.a - x.b));
      const cai = comp.filter((x) => x.a / x.b - 1 <= -0.3 && x.b >= TB * 0.03).sort((x, y) => (x.a - x.b) - (y.a - y.b));
      if (sobe.length) M.push({ t: 'Crescendo contra o ano anterior.', d: lista(sobe, (x) => nomeLinha(x.r) + ' (' + var_(x.a / x.b - 1) + ')') + '.', a: 'Garantir grade completa para não travar o crescimento.' });
      if (cai.length) A.push({ t: 'Caindo contra o ano anterior.', d: lista(cai, (x) => nomeLinha(x.r) + ' (' + var_(x.a / x.b - 1) + ', ' + brl.format(x.a - x.b) + ')') + '.', a: 'Ver se faltou estoque, mudou preço ou perdeu mídia.' });
      const novos = rows.filter((r) => !(c.b.get(r.id) > 0) && (c.a.get(r.id) || 0) >= T * 0.03);
      if (novos.length) M.push({ t: 'Novidades que já vendem.', d: lista(novos, (r) => nomeLinha(r) + ' (' + pct(r.gmv / T) + ' do GMV)') + ', sem venda no mesmo período do ano passado.' });
    }
    // cauda longa
    const cauda = rows.filter((r) => r.gmv / T < 0.01);
    if (v === 'produto' && cauda.length >= 8) A.push({ t: 'Cauda longa.', d: `${cauda.length} produtos vendem menos de 1% cada e somam ${pct(cauda.reduce((s, r) => s + r.gmv, 0) / T)} do GMV.`, a: 'Avaliar descontinuar, vender em kit ou liquidar.' });
    // sell-through
    const G = (PM.G || []).filter((r) => r.dim === (st.g || 'produto'));
    const rapidos = G.filter((r) => r.sell_through >= 0.35 && r.vendidas >= 10).sort((x, y) => y.sell_through - x.sell_through);
    const parados = G.filter((r) => r.sell_through != null && r.sell_through <= 0.1 && r.estoque_final >= 50).sort((x, y) => y.estoque_final - x.estoque_final);
    if (rapidos.length) M.push({ t: 'Giro rápido (sell-through).', d: lista(rapidos, (r) => nomeLinha(r) + ' (' + pct(r.sell_through) + ')') + '.', a: 'Reposição prioritária: o estoque acaba antes dos outros.' });
    if (parados.length) A.push({ t: 'Estoque parado.', d: lista(parados, (r) => nomeLinha(r) + ' (' + int.format(r.estoque_final) + ' peças, ' + pct(r.sell_through) + ' de sell-through)') + '.', a: 'Promoção, kit ou destaque na vitrine para girar.' });
    return { sub: `${PM.rotulo(st.tp)} · visão por ${NOME_VISAO[v] || v}. Leitura automática por regras fixas sobre os números da tela${c ? '; contra o ano anterior, compara ' + faixaMeses(c.meses) + ' com o mesmo período de um ano antes' : '; a comparação com o ano anterior aparece em meses e anos fechados'}.`, m: M, a: A };
  }

  // ---------- Vendas por estado ----------
  const NOME_MED = { gmv: 'GMV', receita: 'receita', pecas: 'peças', pedidos: 'pedidos', devolucoes: 'devoluções', margem: 'margem', frete: 'frete' };
  function analisaEstados() {
    const PM = window.PM; if (!PM || !PM.EM || !PM.EM.length) return null;
    const st = PM.st, m = st.em || 'gmv', ano = st.ey || [...new Set(PM.EM.map((r) => r.ano))].sort().pop();
    const doAno = PM.EM.filter((r) => r.ano === ano);
    const tot = doAno.filter((r) => r.mes === 'total' && r.estado !== 'Sem estado' && r['sh_' + m] != null).sort((x, y) => y['sh_' + m] - x['sh_' + m]);
    if (!tot.length) return { sub: 'Sem vendas no ano escolhido.', m: [], a: [] };
    const M = [], A = [];
    const top = tot.slice(0, 3);
    M.push({ t: 'Estados que sustentam a venda.', d: `${lista(top, (r) => r.estado + ' (' + pct(r['sh_' + m]) + ')')} somam ${pct(top.reduce((s, r) => s + r['sh_' + m], 0))} do ${NOME_MED[m]} em ${ano}.` });
    if (tot[0]['sh_' + m] > 0.4) A.push({ t: 'Concentração geográfica.', d: `${tot[0].estado} sozinho tem ${pct(tot[0]['sh_' + m])} do ${NOME_MED[m]}.`, a: 'Abrir praças parecidas (renda e perfil) com mídia regional.' });
    const ganhos = tot.filter((r) => r['ppa_' + m] != null && r['ppa_' + m] >= 0.01).sort((x, y) => y['ppa_' + m] - x['ppa_' + m]);
    const perdas = tot.filter((r) => r['ppa_' + m] != null && r['ppa_' + m] <= -0.01).sort((x, y) => x['ppa_' + m] - y['ppa_' + m]);
    if (ganhos.length) M.push({ t: 'Ganhando espaço no ano.', d: lista(ganhos, (r) => r.estado + ' (' + pp(r['ppa_' + m]) + ' vs. ano anterior)') + '.', a: 'Manter a mídia e o frete que estão funcionando nessas praças.' });
    if (perdas.length) A.push({ t: 'Perdendo espaço no ano.', d: lista(perdas, (r) => r.estado + ' (' + pp(r['ppa_' + m]) + ' vs. ano anterior)') + '.', a: 'Comparar prazo e preço do frete e a verba de mídia com o ano passado.' });
    // último mês
    const meses = [...new Set(doAno.filter((r) => r.mes !== 'total').map((r) => r.mes))].sort();
    const ult = meses[meses.length - 1];
    if (ult) {
      const cmp = st.ec === 'ano' ? 'ppa_' : 'ppm_', rot = st.ec === 'ano' ? 'vs. mesmo mês do ano anterior' : 'vs. mês anterior';
      const mr = doAno.filter((r) => r.mes === ult && r[cmp + m] != null && r['sh_' + m] >= 0.02);
      const parc = mr.some((r) => r.parcial);
      const sobe = mr.filter((r) => r[cmp + m] >= 0.015).sort((x, y) => y[cmp + m] - x[cmp + m]);
      const desce = mr.filter((r) => r[cmp + m] <= -0.015).sort((x, y) => x[cmp + m] - y[cmp + m]);
      const nm = new Date(ano + '-' + ult + '-15T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long' }) + (parc ? ' (até ontem)' : '');
      if (sobe.length) M.push({ t: `Em alta em ${nm}.`, d: lista(sobe, (r) => r.estado + ' (' + pp(r[cmp + m]) + ' ' + rot + ')') + '.' });
      if (desce.length) A.push({ t: `Em queda em ${nm}.`, d: lista(desce, (r) => r.estado + ' (' + pp(r[cmp + m]) + ' ' + rot + ')') + '.', a: 'Verificar campanhas e entregas recentes para esses estados.' });
    }
    // frete e ticket por estado (ano)
    const base = tot.filter((r) => r.pedidos >= 10);
    const freteMed = base.reduce((s, r) => s + r.frete, 0) / Math.max(1, base.reduce((s, r) => s + r.pedidos, 0));
    const ticketMed = base.reduce((s, r) => s + r.gmv, 0) / Math.max(1, base.reduce((s, r) => s + r.pedidos, 0));
    const caros = base.filter((r) => r.frete / r.pedidos >= freteMed * 1.4 && r.sh_gmv >= 0.01).sort((x, y) => y.frete / y.pedidos - x.frete / x.pedidos);
    if (caros.length) A.push({ t: 'Frete pesado.', d: lista(caros, (r) => r.estado + ' (' + brl.format(r.frete / r.pedidos) + ' por pedido)') + `; a média é ${brl.format(freteMed)}.`, a: 'Testar frete grátis acima de um valor mínimo ou negociar tabela para essas regiões.' });
    const altos = base.filter((r) => r.gmv / r.pedidos >= ticketMed * 1.12 && r.sh_gmv >= 0.02).sort((x, y) => y.gmv / y.pedidos - x.gmv / x.pedidos);
    if (altos.length) M.push({ t: 'Ticket acima da média.', d: lista(altos, (r) => r.estado + ' (' + brl.format(r.gmv / r.pedidos) + ' por pedido)') + `; média de ${brl.format(ticketMed)}.`, a: 'Bom público para kits e lançamentos.' });
    const baixos = base.filter((r) => r.gmv / r.pedidos <= ticketMed * 0.85 && r.sh_gmv >= 0.03).sort((x, y) => x.gmv / x.pedidos - y.gmv / y.pedidos);
    if (baixos.length) A.push({ t: 'Ticket abaixo da média.', d: lista(baixos, (r) => r.estado + ' (' + brl.format(r.gmv / r.pedidos) + ' por pedido)') + '.', a: 'Oferecer kit ou segunda peça com desconto.' });
    return { sub: `${ano} · participação no ${NOME_MED[m]}. Leitura automática por regras fixas sobre os números da tela.`, m: M, a: A };
  }

  // ---------- Estoque ----------
  function analisaEstoque() {
    const r = window.EstoqueAba && window.EstoqueAba.resultado && window.EstoqueAba.resultado();
    if (!r) return null;
    const its = r.itens.filter((i) => i.share > 0 || i.estoque > 0);
    const M = [], A = [];
    const top = its.filter((i) => i.share > 0).sort((x, y) => y.vendas_janela - x.vendas_janela).slice(0, 20);
    const cobertos = top.filter((i) => i.estoque > 0 && (!i.ruptura || i.ruptura > r.R.chegada));
    if (cobertos.length) M.push({ t: 'Mais vendidos cobertos.', d: `${cobertos.length} das 20 peças que mais vendem têm estoque até a chegada de uma compra feita hoje (${r.prazo} dias).` });
    const criticos = top.filter((i) => i.status === 'zerado' || i.status === 'urgente');
    if (criticos.length) {
      A.push({ t: 'Mais vendidos em ruptura.', d: `${criticos.length} das 20 peças que mais vendem estão sem estoque ou acabam antes da reposição: ${lista(criticos, (i) => curto(i.produto, 34) + ' ' + i.tamanho)}.`, a: 'Comprar já e, enquanto não chega, tirar da mídia ou oferecer o tamanho vizinho.' });
    }
    const rapidos = its.filter((i) => i.fator > 1 && i.estoque > 0 && i.status === 'ok');
    if (rapidos.length) M.push({ t: 'Alto giro com estoque em dia.', d: `${rapidos.length} peças com sell-through alto e estoque suficiente, como ${lista(rapidos.sort((x, y) => y.vendas_janela - x.vendas_janela), (i) => curto(i.produto, 30) + ' ' + i.tamanho, 2)}.` });
    const parados = its.filter((i) => i.status === 'parado' || i.status === 'excesso').sort((x, y) => y.estoque - x.estoque);
    if (parados.length) {
      const pecas = parados.reduce((s, i) => s + i.estoque, 0);
      A.push({ t: 'Excesso ou sem venda.', d: `${parados.length} peças somam ${int.format(pecas)} unidades paradas; maiores: ${lista(parados, (i) => curto(i.produto, 30) + ' ' + i.tamanho + ' (' + int.format(i.estoque) + ')')}.`, a: 'Liquidar, montar kits ou dar vitrine antes de comprar mais da mesma estampa.' });
    }
    const L = r.R.loja;
    if (L && L.varBase != null) {
      if (L.varBase < -0.2) A.push({ t: 'Ritmo abaixo do ano passado.', d: `Os 2 últimos meses fechados venderam ${pct(Math.abs(L.varBase))} menos que no ano anterior; a previsão já considera recuperação gradual.`, a: 'Comprar pela previsão, não pelo volume do ano passado, e revisar a previsão no começo de cada mês.' });
      else if (L.varBase > 0) M.push({ t: 'Ritmo acima do ano passado.', d: `Os 2 últimos meses fechados venderam ${pct(L.varBase)} mais que no ano anterior.` });
    }
    const comprar = its.filter((i) => i.comprar > 0);
    if (comprar.length) {
      const tot = comprar.reduce((s, i) => s + i.comprar, 0), top3 = comprar.sort((x, y) => y.comprar - x.comprar).slice(0, 3);
      const sh = top3.reduce((s, i) => s + i.comprar, 0) / tot;
      if (sh >= 0.4) A.push({ t: 'Compra concentrada.', d: `${pct(sh)} das ${int.format(tot)} peças sugeridas estão em 3 itens: ${lista(top3, (i) => curto(i.produto, 30) + ' ' + i.tamanho + ' (' + int.format(i.comprar) + ')')}.`, a: 'Confirmar a grade com o time antes de fechar o pedido.' });
    }
    return { sub: `Venda até ${r.ref.split('-').reverse().join('/')}, compra que chega em ${r.prazo} dias e cobre ${r.cobertura} dias. Leitura automática por regras fixas.`, m: M, a: A };
  }

  // ---------- quando redesenhar ----------
  function atualiza() {
    const PM = window.PM; const aba = PM && PM.st && PM.st.aba;
    try {
      if (aba === 'produtos' && document.getElementById('detalhe')) { const x = analisaProdutos(); if (x) preenche(card('analise-produtos', document.getElementById('detalhe')), x.sub, x.m, x.a); }
      if (aba === 'estados' && document.getElementById('estados')) { const x = analisaEstados(); if (x) preenche(card('analise-estados', document.getElementById('estados')), x.sub, x.m, x.a); }
      if (aba === 'estoque' && document.getElementById('est-tabela')) { const alvo = document.getElementById('est-cards'); const x = analisaEstoque(); if (x && alvo) preenche(card('analise-estoque', alvo.nextElementSibling), x.sub, x.m, x.a); }
    } catch (e) { /* a análise nunca deve quebrar o painel */ console.warn('analise', e); }
  }
  let t = null; const agenda = () => { clearTimeout(t); t = setTimeout(atualiza, 120); };
  for (const id of ['tabela', 'tabela-giro', 'tabela-estados', 'est-tabela', 'est-cards']) { const e = document.getElementById(id); if (e) new MutationObserver(agenda).observe(e, { childList: true, subtree: true }); }
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#abas, select, .pm-seg')) agenda(); });
  document.addEventListener('change', agenda);
  setTimeout(agenda, 300);
  let n = 0; const h = setInterval(() => { agenda(); if (++n > 20) clearInterval(h); }, 1500);
})();
