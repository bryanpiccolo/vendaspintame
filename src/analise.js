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
  css.textContent = '.pm-analise{border-left:3px solid var(--color-fg)}.pm-analise .pm-an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:var(--cds-gap-lg)}.pm-analise h3{font-size:var(--cds-font-size-body);margin:0 0 var(--cds-gap-sm);display:flex;align-items:center;gap:.4rem}.pm-analise h3 i{width:.6rem;height:.6rem;border-radius:50%;display:inline-block}.pm-analise ul{margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:.55rem;font-size:var(--cds-font-size-caption);line-height:1.5}.pm-analise li b{font-weight:var(--cds-font-weight-medium)}.pm-analise .pm-acao{display:block;color:var(--color-fg-muted)}.pm-analise .pm-vazio{color:var(--color-fg-muted);list-style:none;margin-left:-1.1rem}.pm-analise li.pm-an-abre>.pm-an-txt{cursor:pointer}.pm-analise li.pm-an-abre>.pm-an-txt:hover{text-decoration:underline;text-decoration-color:var(--color-fg-muted)}.pm-analise .pm-an-ver{color:var(--color-fg-muted);white-space:nowrap;margin-left:.3rem;font-size:.95em}.pm-analise .pm-an-det{margin:.35rem 0 .2rem;max-height:22rem;overflow:auto;border:1px solid var(--color-border-line);border-radius:6px}.pm-analise .pm-an-det table{border-collapse:collapse;width:100%;font-size:var(--cds-font-size-caption)}.pm-analise .pm-an-det th,.pm-analise .pm-an-det td{padding:3px 8px;border-bottom:1px solid var(--color-border-line);text-align:right;white-space:nowrap}.pm-analise .pm-an-det th:first-child,.pm-analise .pm-an-det td:first-child{text-align:left;white-space:normal;min-width:13rem}.pm-analise .pm-an-det th{position:sticky;top:0;background:var(--color-panel);font-weight:var(--cds-font-weight-medium)}';
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
  const abertos = new Set();
  function tabelaDet(det) {
    const box = el('div', 'pm-an-det'); const t = el('table'); const th = el('tr');
    for (const h of det.cab) th.appendChild(el('th', '', h));
    const tb = el('tbody');
    for (const l of det.linhas) { const tr = el('tr'); for (const v of l) tr.appendChild(el('td', '', v == null ? '—' : String(v))); tb.appendChild(tr); }
    const thead = el('thead'); thead.appendChild(th); t.append(thead, tb); box.appendChild(t); return box;
  }
  function preenche(c, sub, manter, ajustar) {
    c.querySelector('.pm-an-sub').textContent = sub;
    for (const [k, itens, vazio] of [['manter', manter, 'Nenhum destaque positivo forte neste recorte.'], ['ajustar', ajustar, 'Nenhum ponto de atenção relevante neste recorte.']]) {
      const ul = c.querySelector('.pm-an-' + k); ul.replaceChildren();
      if (!itens.length) { ul.appendChild(el('li', 'pm-vazio', vazio)); continue; }
      for (const it of itens.slice(0, 6)) {
        const li = el('li'); const txt = el('span', 'pm-an-txt');
        txt.appendChild(el('b', '', it.t)); txt.appendChild(document.createTextNode(' ' + it.d));
        li.appendChild(txt);
        if (it.det && it.det.linhas.length) {
          const chave = c.id + '|' + it.t; li.classList.add('pm-an-abre');
          const ver = el('span', 'pm-an-ver'); txt.appendChild(ver);
          txt.setAttribute('role', 'button'); txt.tabIndex = 0;
          const mostra = (on) => { ver.textContent = on ? '▴ fechar lista' : '▾ ver lista (' + it.det.linhas.length + ')'; const old = li.querySelector('.pm-an-det'); if (old) old.remove(); if (on) txt.after(tabelaDet(it.det)); txt.setAttribute('aria-expanded', on); };
          const troca = () => { const on = !abertos.has(chave); on ? abertos.add(chave) : abertos.delete(chave); mostra(on); };
          txt.addEventListener('click', troca); txt.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); troca(); } });
          mostra(abertos.has(chave));
        }
        if (it.a) li.appendChild(el('span', 'pm-acao', '→ ' + it.a));
        ul.appendChild(li);
      }
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
  const fBrl = (v) => v == null ? '—' : brl.format(v);
  const fInt = (v) => v == null ? '—' : int.format(v);
  const fPct = (v) => v == null || !isFinite(v) ? '—' : pct(v);
  const ROT_VISAO = { produto: 'Produto', estampa: 'Estampa', categoria: 'Categoria', tamanho: 'Tamanho' };
  const rotVisao = (v) => v.split('_').map((d) => ROT_VISAO[d] || d).join(' · ');

  function analisaProdutos() {
    const PM = window.PM; if (!PM || !PM.L || !PM.L.length) return null;
    const st = PM.st, v = st.v, quem = rotVisao(v);
    const rows = PM.L.filter((r) => r.dim === v && r.id !== 'total' && r.gmv > 0).sort((x, y) => y.gmv - x.gmv);
    const tot = PM.L.find((r) => r.id === 'total');
    if (!rows.length || !tot) return { sub: 'Sem vendas no período escolhido.', m: [], a: [] };
    const T = rows.reduce((s, r) => s + r.gmv, 0);
    const M = [], A = [];
    const linhaBase = (r) => [nomeLinha(r), fBrl(r.gmv), fPct(r.gmv / T), fInt(r.pecas), fBrl(r.ticket), fPct(r.margem_pct)];
    const cabBase = [quem, 'GMV', '% do GMV', 'Peças', 'Ticket', 'Margem'];
    // concentração: quem forma 80% do GMV
    const top = rows.slice(0, 3), shTop = top.reduce((s, r) => s + r.gmv, 0) / T;
    let acum = 0; const ate80 = []; for (const r of rows) { ate80.push(r); acum += r.gmv; if (acum / T >= 0.8) break; }
    let ac2 = 0;
    M.push({ t: 'Carros-chefe.', d: `${lista(top, (r) => nomeLinha(r) + ' (' + pct(r.gmv / T) + ')')} somam ${pct(shTop)} do GMV; ${ate80.length} de ${rows.length} itens fazem 80% da venda.`, a: 'Proteger estoque, foto e posição na vitrine desses itens.',
      det: { cab: [...cabBase, 'Acumulado'], linhas: ate80.map((r) => { ac2 += r.gmv; return [...linhaBase(r), fPct(ac2 / T)]; }) } });
    if (rows.length >= 4 && rows[0].gmv / T > 0.35) A.push({ t: 'Dependência alta de um item.', d: `${nomeLinha(rows[0])} sozinho responde por ${pct(rows[0].gmv / T)} do GMV.`, a: 'Testar o 2º e o 3º colocados em mídia e vitrine para diluir o risco.' });
    // margem
    const comMargem = rows.filter((r) => r.margem_pct != null && r.receita > 0);
    const mMed = tot.margem_pct;
    if (mMed != null && comMargem.length >= 3) {
      const boas = comMargem.filter((r) => r.margem_pct >= mMed + 0.05 && r.gmv / T >= 0.03).sort((x, y) => y.gmv - x.gmv);
      if (boas.length) M.push({ t: 'Margem acima da média com volume.', d: `${boas.length} ${boas.length > 1 ? 'itens' : 'item'} com margem 5 p.p. ou mais acima da média (${pct(mMed)}) e pelo menos 3% do GMV: ${lista(boas, (r) => nomeLinha(r) + ' (' + pct(r.margem_pct) + ')')}.`, a: 'Bons candidatos para receber mais verba de mídia.', det: { cab: cabBase, linhas: boas.map(linhaBase) } });
      const ruins = comMargem.filter((r) => r.margem_pct <= mMed - 0.08 && r.gmv / T >= 0.02).sort((x, y) => x.margem_pct - y.margem_pct);
      if (ruins.length) A.push({ t: 'Margem abaixo da média.', d: `${ruins.length} ${ruins.length > 1 ? 'itens' : 'item'} com margem 8 p.p. ou mais abaixo da loja (${pct(mMed)}): ${lista(ruins, (r) => nomeLinha(r) + ' (' + pct(r.margem_pct) + ')')}.`, a: 'Rever desconto, preço ou custo (ficha técnica) desses itens.', det: { cab: cabBase, linhas: ruins.map(linhaBase) } });
    }
    // devoluções
    const devMed = tot.gmv > 0 ? tot.devolucoes / tot.gmv : 0;
    const dev = rows.filter((r) => r.devolucoes >= 200 && r.devolucoes / r.gmv >= Math.max(0.05, devMed * 2)).sort((x, y) => y.devolucoes - x.devolucoes);
    if (dev.length) A.push({ t: 'Devolução acima do normal.', d: `${dev.length} ${dev.length > 1 ? 'itens' : 'item'} com devolução de pelo menos 5% do GMV e o dobro da média (${pct1(devMed)}): ${lista(dev, (r) => nomeLinha(r) + ' (' + pct(r.devolucoes / r.gmv) + ')')}.`, a: 'Checar motivos: tamanho, qualidade, foto que não condiz.',
      det: { cab: [quem, 'GMV', 'Devoluções', '% do GMV do item'], linhas: dev.map((r) => [nomeLinha(r), fBrl(r.gmv), fBrl(r.devolucoes), fPct(r.devolucoes / r.gmv)]) } });
    else if (devMed > 0 && devMed < 0.03) M.push({ t: 'Devoluções sob controle.', d: `${pct1(devMed)} do GMV no período.` });
    // custo
    if (tot.receita_sem_custo > 0) {
      const sem = rows.filter((r) => r.receita_sem_custo > 0).sort((x, y) => y.receita_sem_custo - x.receita_sem_custo);
      A.push({ t: 'Venda sem custo cadastrado.', d: `${brl.format(tot.receita_sem_custo)} de receita veio de variantes sem custo no Shopify, o que distorce a margem${sem.length ? ' (' + sem.length + ' itens)' : ''}.`, a: 'Preencher o custo por item dessas variantes.',
        det: sem.length ? { cab: [quem, 'Receita sem custo', 'Receita total'], linhas: sem.map((r) => [nomeLinha(r), fBrl(r.receita_sem_custo), fBrl(r.receita)]) } : null });
    }
    // ano anterior
    const c = comparaAno(st.tp, v);
    if (c) {
      const comp = rows.map((r) => ({ r, a: c.a.get(r.id) || 0, b: c.b.get(r.id) || 0 })).filter((x) => x.b > 0);
      const TB = [...c.b.values()].reduce((s, x) => s + x, 0);
      const sobe = comp.filter((x) => x.a / x.b - 1 >= 0.2 && x.a >= T * 0.02).sort((x, y) => (y.a - y.b) - (x.a - x.b));
      const cai = comp.filter((x) => x.a / x.b - 1 <= -0.3 && x.b >= TB * 0.03).sort((x, y) => (x.a - x.b) - (y.a - y.b));
      // itens que vendiam e sumiram (não estão nas linhas do período)
      const ids = new Set(rows.map((r) => r.id));
      const sumiram = [...c.b.entries()].filter(([k, b]) => !ids.has(k) && b >= TB * 0.03 && !(c.a.get(k) > 0)).sort((x, y) => y[1] - x[1]);
      const cabC = [quem, 'GMV agora', 'GMV ano anterior', 'Variação', 'Diferença'];
      const linC = (x) => [nomeLinha(x.r), fBrl(x.a), fBrl(x.b), var_(x.a / x.b - 1), fBrl(x.a - x.b)];
      if (sobe.length) M.push({ t: 'Crescendo contra o ano anterior.', d: `${sobe.length} ${sobe.length > 1 ? 'itens' : 'item'} cresceram 20% ou mais: ${lista(sobe, (x) => nomeLinha(x.r) + ' (' + var_(x.a / x.b - 1) + ')')}.`, a: 'Garantir grade completa para não travar o crescimento.', det: { cab: cabC, linhas: sobe.map(linC) } });
      if (cai.length || sumiram.length) {
        const linS = sumiram.map(([k, b]) => [curto(k.slice(k.indexOf('|') + 1), 60), fBrl(0), fBrl(b), '−100%', fBrl(-b)]);
        A.push({ t: 'Caindo contra o ano anterior.', d: `${cai.length + sumiram.length} itens caíram 30% ou mais${cai.length ? ': ' + lista(cai, (x) => nomeLinha(x.r) + ' (' + var_(x.a / x.b - 1) + ', ' + brl.format(x.a - x.b) + ')') : ''}.`, a: 'Ver se faltou estoque, mudou preço ou perdeu mídia.', det: { cab: cabC, linhas: [...cai.map(linC), ...linS] } });
      }
      const novos = rows.filter((r) => !(c.b.get(r.id) > 0) && (c.a.get(r.id) || 0) >= T * 0.03);
      if (novos.length) M.push({ t: 'Novidades que já vendem.', d: lista(novos, (r) => nomeLinha(r) + ' (' + pct(r.gmv / T) + ' do GMV)') + ', sem venda no mesmo período do ano passado.', det: { cab: cabBase, linhas: novos.map(linhaBase) } });
    }
    // cauda longa
    const cauda = rows.filter((r) => r.gmv / T < 0.01);
    if (cauda.length >= 8) A.push({ t: 'Cauda longa.', d: `${cauda.length} ${quem.toLowerCase()}s vendem menos de 1% cada e somam ${pct(cauda.reduce((s, r) => s + r.gmv, 0) / T)} do GMV; os maiores: ${lista(cauda, (r) => nomeLinha(r), 3)}.`, a: 'Avaliar descontinuar, vender em kit ou liquidar.', det: { cab: cabBase, linhas: cauda.map(linhaBase) } });
    // sell-through (tabela de giro da tela)
    const gdim = st.g || 'produto';
    const G = (PM.G || []).filter((r) => r.dim === gdim);
    const rapidos = G.filter((r) => r.sell_through >= 0.35 && r.vendidas >= 10).sort((x, y) => y.sell_through - x.sell_through);
    const parados = G.filter((r) => r.sell_through != null && r.sell_through <= 0.1 && r.estoque_final >= 50).sort((x, y) => y.estoque_final - x.estoque_final);
    const cabG = [rotVisao(gdim), 'Vendidas', 'Estoque', 'Sell-through'];
    const linG = (r) => [nomeLinha(r), fInt(r.vendidas), fInt(r.estoque_final), fPct(r.sell_through)];
    if (rapidos.length) M.push({ t: 'Giro rápido (sell-through).', d: `${rapidos.length} com sell-through de 35% ou mais: ${lista(rapidos, (r) => nomeLinha(r) + ' (' + pct(r.sell_through) + ')')}.`, a: 'Reposição prioritária: o estoque acaba antes dos outros.', det: { cab: cabG, linhas: rapidos.map(linG) } });
    if (parados.length) A.push({ t: 'Estoque parado.', d: `${parados.length} com 10% ou menos de sell-through e 50 peças ou mais, somando ${int.format(parados.reduce((s, r) => s + r.estoque_final, 0))} peças: ${lista(parados, (r) => nomeLinha(r) + ' (' + int.format(r.estoque_final) + ')')}.`, a: 'Promoção, kit ou destaque na vitrine para girar.', det: { cab: cabG, linhas: parados.map(linG) } });
    return { sub: `${PM.rotulo(st.tp)} · visão por ${NOME_VISAO[v] || v}. Clique numa afirmação para ver a lista completa${c ? '. Contra o ano anterior, compara ' + faixaMeses(c.meses) + ' com o mesmo período de um ano antes' : '. A comparação com o ano anterior aparece em meses e anos fechados'}.`, m: M, a: A };
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
    const ppf = (v) => v == null ? '—' : pp(v);
    const cabE = ['Estado', 'GMV', 'Participação', 'vs. ano anterior', 'Pedidos', 'Ticket', 'Frete/pedido'];
    const linE = (r) => [r.estado, fBrl(r.gmv), fPct(r['sh_' + m]), ppf(r['ppa_' + m]), fInt(r.pedidos), r.pedidos ? fBrl(r.gmv / r.pedidos) : '—', r.pedidos ? fBrl(r.frete / r.pedidos) : '—'];
    const top = tot.slice(0, 3);
    let acum = 0; const ate80 = []; for (const r of tot) { ate80.push(r); acum += r['sh_' + m]; if (acum >= 0.8) break; }
    M.push({ t: 'Estados que sustentam a venda.', d: `${lista(top, (r) => r.estado + ' (' + pct(r['sh_' + m]) + ')')} somam ${pct(top.reduce((s, r) => s + r['sh_' + m], 0))} do ${NOME_MED[m]} em ${ano}; ${ate80.length} estados fazem 80%.`, det: { cab: cabE, linhas: tot.map(linE) } });
    if (tot[0]['sh_' + m] > 0.4) A.push({ t: 'Concentração geográfica.', d: `${tot[0].estado} sozinho tem ${pct(tot[0]['sh_' + m])} do ${NOME_MED[m]}.`, a: 'Abrir praças parecidas (renda e perfil) com mídia regional.' });
    const ganhos = tot.filter((r) => r['ppa_' + m] != null && r['ppa_' + m] >= 0.01).sort((x, y) => y['ppa_' + m] - x['ppa_' + m]);
    const perdas = tot.filter((r) => r['ppa_' + m] != null && r['ppa_' + m] <= -0.01).sort((x, y) => x['ppa_' + m] - y['ppa_' + m]);
    if (ganhos.length) M.push({ t: 'Ganhando espaço no ano.', d: lista(ganhos, (r) => r.estado + ' (' + pp(r['ppa_' + m]) + ')') + ' de participação contra o ano anterior.', a: 'Manter a mídia e o frete que estão funcionando nessas praças.', det: { cab: cabE, linhas: ganhos.map(linE) } });
    if (perdas.length) A.push({ t: 'Perdendo espaço no ano.', d: lista(perdas, (r) => r.estado + ' (' + pp(r['ppa_' + m]) + ')') + ' de participação contra o ano anterior.', a: 'Comparar prazo e preço do frete e a verba de mídia com o ano passado.', det: { cab: cabE, linhas: perdas.map(linE) } });
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
      const cabM = ['Estado', 'GMV no mês', 'Participação', rot];
      const linM = (r) => [r.estado, fBrl(r.gmv), fPct(r['sh_' + m]), pp(r[cmp + m])];
      if (sobe.length) M.push({ t: `Em alta em ${nm}.`, d: lista(sobe, (r) => r.estado + ' (' + pp(r[cmp + m]) + ')') + ' ' + rot + '.', det: { cab: cabM, linhas: sobe.map(linM) } });
      if (desce.length) A.push({ t: `Em queda em ${nm}.`, d: lista(desce, (r) => r.estado + ' (' + pp(r[cmp + m]) + ')') + ' ' + rot + '.', a: 'Verificar campanhas e entregas recentes para esses estados.', det: { cab: cabM, linhas: desce.map(linM) } });
    }
    // frete e ticket por estado (ano)
    const base = tot.filter((r) => r.pedidos >= 10);
    const freteMed = base.reduce((s, r) => s + r.frete, 0) / Math.max(1, base.reduce((s, r) => s + r.pedidos, 0));
    const ticketMed = base.reduce((s, r) => s + r.gmv, 0) / Math.max(1, base.reduce((s, r) => s + r.pedidos, 0));
    const caros = base.filter((r) => r.frete / r.pedidos >= freteMed * 1.4 && r.sh_gmv >= 0.01).sort((x, y) => y.frete / y.pedidos - x.frete / x.pedidos);
    if (caros.length) A.push({ t: 'Frete pesado.', d: lista(caros, (r) => r.estado + ' (' + brl.format(r.frete / r.pedidos) + ' por pedido)') + `; a média é ${brl.format(freteMed)}.`, a: 'Testar frete grátis acima de um valor mínimo ou negociar tabela para essas regiões.', det: { cab: cabE, linhas: caros.map(linE) } });
    const altos = base.filter((r) => r.gmv / r.pedidos >= ticketMed * 1.12 && r.sh_gmv >= 0.02).sort((x, y) => y.gmv / y.pedidos - x.gmv / x.pedidos);
    if (altos.length) M.push({ t: 'Ticket acima da média.', d: lista(altos, (r) => r.estado + ' (' + brl.format(r.gmv / r.pedidos) + ' por pedido)') + `; média de ${brl.format(ticketMed)}.`, a: 'Bom público para kits e lançamentos.', det: { cab: cabE, linhas: altos.map(linE) } });
    const baixos = base.filter((r) => r.gmv / r.pedidos <= ticketMed * 0.85 && r.sh_gmv >= 0.03).sort((x, y) => x.gmv / x.pedidos - y.gmv / y.pedidos);
    if (baixos.length) A.push({ t: 'Ticket abaixo da média.', d: lista(baixos, (r) => r.estado + ' (' + brl.format(r.gmv / r.pedidos) + ' por pedido)') + `; média de ${brl.format(ticketMed)}.`, a: 'Oferecer kit ou segunda peça com desconto.', det: { cab: cabE, linhas: baixos.map(linE) } });
    return { sub: `${ano} · participação no ${NOME_MED[m]}. Clique numa afirmação para ver a lista completa.`, m: M, a: A };
  }

  // ---------- Estoque ----------
  // A ação comercial é no produto (todos os tamanhos) ou na estampa; o tamanho entra como detalhe.
  const MESES_BASE = 2;
  function agrupa(its, campo) {
    const acc = new Map();
    for (const i of its) {
      const k = i[campo] || (campo === 'estampa' ? 'Sem estampa' : '—');
      let g = acc.get(k);
      if (!g) { g = { nome: k, estoque: 0, vj: 0, mensal: 0, comprar: 0, share: 0, tam: [], faltam: [], acabam: [], semVenda: 0, produtos: new Set() }; acc.set(k, g); }
      g.estoque += Math.max(0, i.estoque); g.vj += Math.max(0, i.vendas_janela); g.mensal += Math.max(0, i.vendas_janela_fechada) / MESES_BASE; g.comprar += i.comprar || 0; g.share += i.share || 0; g.produtos.add(i.produto); g.porProd = g.porProd || new Map(); g.porProd.set(i.produto, (g.porProd.get(i.produto) || 0) + Math.max(0, i.estoque));
      if (i.share > 0) g.tam.push(i);
      if (i.status === 'zerado') g.faltam.push(i); else if (i.status === 'urgente') g.acabam.push(i);
    }
    return [...acc.values()].map((g) => ({ ...g, st: g.vj + g.estoque > 0 ? g.vj / (g.vj + g.estoque) : null, meses: g.mensal > 0 ? g.estoque / g.mensal : (g.estoque > 0 ? Infinity : 0), shQuebra: g.share > 0 ? [...g.faltam, ...g.acabam].reduce((s, i) => s + i.share, 0) / g.share : 0 }));
  }
  const tams = (arr) => arr.slice().sort((x, y) => String(x.tamanho).localeCompare(String(y.tamanho), 'pt-BR', { numeric: true })).map((i) => i.tamanho).join(', ');
  const fMeses = (v) => v === Infinity ? 'sem venda' : v == null ? '—' : v > 24 ? 'mais de 24 meses' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v) + ' meses';

  function analisaEstoque() {
    const r = window.EstoqueAba && window.EstoqueAba.resultado && window.EstoqueAba.resultado();
    if (!r) return null;
    // embalagem e envelope de presente não recebem ação comercial
    const its = r.itens.filter((i) => (i.share > 0 || i.estoque > 0) && !/embalagem|envelope|sacola/i.test(i.produto));
    const M = [], A = [];
    const P = agrupa(its, 'produto').sort((x, y) => y.vj - x.vj);
    const E = agrupa(its, 'estampa').filter((g) => g.nome !== 'Sem estampa').sort((x, y) => y.vj - x.vj);
    const totVj = P.reduce((s, g) => s + g.vj, 0), totEst = P.reduce((s, g) => s + g.estoque, 0);
    const stLoja = totVj + totEst > 0 ? totVj / (totVj + totEst) : 0;
    const cabP = ['Produto', 'Vendidas (janela)', 'Estoque', 'Sell-through', 'Estoque dura', 'Sem estoque', 'Acabam antes da reposição', 'Comprar'];
    const linP = (g) => [curto(g.nome, 60), fInt(g.vj), fInt(g.estoque), fPct(g.st), fMeses(g.meses), tams(g.faltam) || '—', tams(g.acabam) || '—', g.comprar ? fInt(g.comprar) : '—'];
    const cabE = ['Estampa', 'Produtos', 'Vendidas (janela)', 'Estoque', 'Sell-through', 'Estoque dura', 'Comprar', 'Onde está o estoque'];
    const onde = (g) => [...(g.porProd || new Map()).entries()].filter(([, q]) => q > 0).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, q]) => curto(n, 28) + ' (' + int.format(q) + ')').join('; ');
    const linE = (g) => [g.nome, g.produtos.size, fInt(g.vj), fInt(g.estoque), fPct(g.st), fMeses(g.meses), g.comprar ? fInt(g.comprar) : '—', onde(g) || '—'];
    const comVenda = P.filter((g) => g.vj > 0);
    const topN = comVenda.slice(0, 15);
    // grade
    const quebrados = topN.filter((g) => g.faltam.length || g.acabam.length);
    const completos = topN.filter((g) => !g.faltam.length && !g.acabam.length);
    if (completos.length) M.push({ t: 'Mais vendidos com grade completa.', d: `${completos.length} dos ${topN.length} produtos que mais vendem têm todos os tamanhos com estoque até a chegada de uma compra feita hoje (${r.prazo} dias): ${lista(completos, (g) => curto(g.nome, 34))}.`, a: 'Podem receber mídia e vitrine sem risco de vender tamanho que não tem.', det: { cab: cabP, linhas: completos.map(linP) } });
    if (quebrados.length) A.push({ t: 'Mais vendidos com grade quebrada.', d: `${quebrados.length} dos ${topN.length} produtos que mais vendem têm tamanho zerado ou que acaba antes da reposição: ${lista(quebrados, (g) => curto(g.nome, 30) + ' (' + tams([...g.faltam, ...g.acabam]) + '; ' + pct(g.shQuebra) + ' da venda do produto)')}.`, a: 'Repor esses tamanhos já. Se o tamanho em falta for grande parte da venda do produto, segurar a mídia do produto até a reposição.', det: { cab: [...cabP, '% da venda nos tamanhos em falta'], linhas: quebrados.map((g) => [...linP(g), fPct(g.shQuebra)]) } });
    // giro por produto e por estampa
    const giroP = comVenda.filter((g) => g.st != null && g.st >= Math.max(0.3, stLoja * 1.5) && g.vj >= 20).sort((x, y) => y.st - x.st);
    if (giroP.length) M.push({ t: 'Produtos de giro rápido.', d: `${giroP.length} produtos com sell-through bem acima da loja (${pct(stLoja)}): ${lista(giroP, (g) => curto(g.nome, 30) + ' (' + pct(g.st) + ')')}.`, a: 'Prioridade na compra e na verba de mídia; a compra sugerida já aplica fator extra para eles.', det: { cab: cabP, linhas: giroP.map(linP) } });
    const eBoas = E.filter((g) => g.st != null && g.st >= stLoja * 1.2 && g.vj >= 20).sort((x, y) => y.st - x.st);
    if (eBoas.length) M.push({ t: 'Estampas que giram melhor.', d: `${lista(eBoas, (g) => g.nome + ' (' + pct(g.st) + ' de sell-through)')}; a loja tem ${pct(stLoja)}.`, a: 'Boas estampas para novos modelos e para reposição de tecido.', det: { cab: cabE, linhas: eBoas.map(linE) } });
    // excesso por produto e por estampa
    const excP = P.filter((g) => g.estoque >= 30 && (g.meses === Infinity || g.meses >= 6)).sort((x, y) => y.estoque - x.estoque);
    if (excP.length) A.push({ t: 'Produtos com estoque para muitos meses.', d: `${excP.length} produtos têm estoque para 6 meses ou mais no ritmo atual (ou não vendem), somando ${int.format(excP.reduce((s, g) => s + g.estoque, 0))} peças: ${lista(excP, (g) => curto(g.nome, 30) + ' (' + int.format(g.estoque) + ', ' + fMeses(g.meses) + ')')}.`, a: 'Ação comercial no produto inteiro: desconto, kit ou destaque na vitrine. Não recomprar até girar.', det: { cab: cabP, linhas: excP.map(linP) } });
    const excE = E.filter((g) => g.estoque >= 50 && (g.meses === Infinity || g.meses >= 6) && !(g.st >= stLoja)).sort((x, y) => y.estoque - x.estoque);
    if (excE.length) A.push({ t: 'Estampas com estoque alto e giro abaixo da loja.', d: `${lista(excE, (g) => g.nome + ' (' + int.format(g.estoque) + ' peças, ' + fMeses(g.meses) + '; mais em ' + (onde(g).split('; ')[0] || '—') + ')')}.`, a: 'Ação pela estampa (vitrine da coleção, kit da estampa). Se for comprar tecido dela, só para os modelos que estão em falta.', det: { cab: cabE, linhas: excE.map(linE) } });
    // ritmo
    const L = r.R.loja;
    if (L && L.varBase != null) {
      if (L.varBase < -0.2) A.push({ t: 'Ritmo abaixo do ano passado.', d: `Os 2 últimos meses fechados venderam ${pct(Math.abs(L.varBase))} menos que no ano anterior; a previsão já considera recuperação gradual.`, a: 'Comprar pela previsão, não pelo volume do ano passado, e revisar a previsão no começo de cada mês.' });
      else if (L.varBase > 0) M.push({ t: 'Ritmo acima do ano passado.', d: `Os 2 últimos meses fechados venderam ${pct(L.varBase)} mais que no ano anterior.` });
    }
    // compra por produto
    const comp = P.filter((g) => g.comprar > 0).sort((x, y) => y.comprar - x.comprar);
    if (comp.length) {
      const tot = comp.reduce((s, g) => s + g.comprar, 0), top3 = comp.slice(0, 3);
      const sh = top3.reduce((s, g) => s + g.comprar, 0) / tot;
      if (sh >= 0.4) A.push({ t: 'Compra concentrada.', d: `${pct(sh)} das ${int.format(tot)} peças sugeridas estão em 3 produtos: ${lista(top3, (g) => curto(g.nome, 30) + ' (' + int.format(g.comprar) + ')')}.`, a: 'Confirmar a grade com o time antes de fechar o pedido.', det: { cab: [...cabP, '% da compra'], linhas: comp.map((g) => [...linP(g), fPct(g.comprar / tot)]) } });
    }
    return { sub: `Venda até ${r.ref.split('-').reverse().join('/')}, compra que chega em ${r.prazo} dias e cobre ${r.cobertura} dias. Leitura por produto e por estampa (todos os tamanhos juntos); os tamanhos aparecem na lista. Clique numa afirmação para abrir.`, m: M, a: A };
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
