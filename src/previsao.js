// Previsão de vendas e de ruptura de estoque (só vendas do site/Shopify).
//
// Método:
// 1. Loja: sazonalidade mensal pela razão entre cada mês e a média móvel centrada de 12 meses
//    (meses de 2024 em diante). Nível atual = média dos 3 últimos meses fechados sem a sazonalidade.
//    Previsão de um mês futuro = nível × índice do mês.
// 2. Mês corrente: curva de quanto do mês costuma estar vendido em cada dia (12 meses fechados mais
//    recentes). O fechamento previsto mistura o ritmo do mês (vendido até ontem ÷ parcela da curva)
//    com a previsão sazonal, dando mais peso ao ritmo do mês conforme ele avança.
// 3. Produto/tamanho: a previsão da loja em peças é dividida pela participação de cada peça nas vendas
//    dos últimos 3 meses fechados + mês corrente. Variantes de 6 e 12 canetinhas do mesmo tamanho e cor
//    são a mesma peça física e contam juntas; o estoque delas conta uma vez só.
// 4. Ruptura: dia em que a venda prevista acumulada passa o estoque de hoje. Compra sugerida =
//    venda prevista durante (prazo de reposição + cobertura desejada) − estoque de hoje.
(function (raiz) {
  const TXT = new Set(['product_type', 'product_title', 'product_variant_title']);
  const abre = (c) => Array.isArray(c) ? c : c.linhas.map((l) => Object.fromEntries(c.campos.map((f, i) => [f, TXT.has(f) ? c.dic[l[i]] : l[i]])));
  const addMes = (k, n) => { let [y, m] = k.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); };
  const diasNoMes = (k) => { const [y, m] = k.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  const fisico = (v) => String(v || '').split('/').map((x) => x.trim()).filter((x) => x && !/canetinha|gr[aá]tis|7[.,]90|unidades/i.test(x)).join(' / ') || 'Default Title';
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
    const regras = [['passarinho', 'Voa Passarinho'], ['viagem colorida', 'Viagem Colorida'], ['dia de brincar', 'Dia de Brincar'], ['pets', 'Pets'], ['alfabeto', 'Alfabeto da PINTA'], ['caça-palavras', 'Alfabeto da PINTA'], ['copa do mundo', 'Copa do Mundo / Futebol'], ['futebol', 'Copa do Mundo / Futebol'], ['mergulho', 'Um Mergulho na Ilha'], ['frutaria', 'Frutaria'], ['natal', 'Natal'], ['tangram', 'Tangram']];
    for (const [k, v] of regras) if (x.includes(k)) return v;
    return 'Sem estampa';
  };
  const nomeLimpo = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function loja(D, metrica) {
    const val = (r) => metrica === 'pecas' ? (r.net_items_sold || 0) : (r.gross_sales || 0) + (r.discounts || 0) + (r.shipping_charges || 0);
    const ref = D.referencia, mesRef = ref.slice(0, 7), diaRef = +ref.slice(8, 10);
    const serie = new Map(D.mensal.map((r) => [String(r.month).slice(0, 7), val(r)]));
    const meses = [...serie.keys()].sort();
    const fechados = meses.filter((m) => m < mesRef || (m === mesRef && diaRef === diasNoMes(m)));
    const x = (k) => serie.get(k);
    // razão para a média móvel centrada 2x12
    const razoes = {};
    for (const t of fechados) {
      if (t < '2024-01') continue;
      const viz = []; for (let i = -6; i <= 6; i++) viz.push(x(addMes(t, i)));
      if (viz.some((v) => v == null) || addMes(t, 6) > fechados[fechados.length - 1]) continue;
      const ma = (0.5 * viz[0] + viz.slice(1, 12).reduce((a, b) => a + b, 0) + 0.5 * viz[12]) / 12;
      if (ma > 0) (razoes[t.slice(5)] = razoes[t.slice(5)] || []).push(x(t) / ma);
    }
    const S = {};
    for (let n = 1; n <= 12; n++) { const k = String(n).padStart(2, '0'); const r = razoes[k] || [1]; S[k] = r.reduce((a, b) => a + b, 0) / r.length; }
    const mediaS = Object.values(S).reduce((a, b) => a + b, 0) / 12; for (const k in S) S[k] /= mediaS;
    const ult3 = fechados.slice(-3);
    const nivel = ult3.reduce((a, m) => a + x(m) / S[m.slice(5)], 0) / ult3.length;
    // curva intramês (parcela acumulada vendida até o dia d), últimos 12 meses fechados com dados diários
    const porDia = new Map(D.diario_total.map((r) => [r.day, val(r)]));
    const curvas = [];
    for (let i = 1; i <= 12; i++) {
      const m = addMes(mesRef, -i), nd = diasNoMes(m);
      const v = []; let ok = true;
      for (let d = 1; d <= nd; d++) { const k = m + '-' + String(d).padStart(2, '0'); if (!porDia.has(k)) { ok = false; break; } v.push(porDia.get(k)); }
      const tot = v.reduce((a, b) => a + b, 0);
      if (ok && tot > 0) { let acc = 0; curvas.push(v.map((y) => (acc += y) / tot).map((c, j) => ({ frac: (j + 1) / nd, c }))); }
    }
    // parcela acumulada por fração do mês (os meses têm tamanhos diferentes)
    const parcela = (frac) => {
      if (!curvas.length) return frac;
      const vals = curvas.map((cv) => { const i = Math.min(cv.length - 1, Math.max(0, Math.round(frac * cv.length) - 1)); return cv[i].c; });
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    const ndRef = diasNoMes(mesRef);
    const mtd = x(mesRef) || 0;
    const c = Math.min(0.999, Math.max(0.001, parcela(diaRef / ndRef)));
    const sazonal = nivel * S[mesRef.slice(5)];
    const ritmo = mtd / c;
    const fechamento = c * ritmo + (1 - c) * sazonal; // mistura: cada vez mais o ritmo do mês
    const restante = Math.max(0, fechamento - mtd);
    // previsão diária do restante do mês, pela curva
    const diasRestantes = [];
    for (let d = diaRef + 1; d <= ndRef; d++) {
      const inc = Math.max(0, parcela(d / ndRef) - parcela((d - 1) / ndRef));
      diasRestantes.push({ dia: mesRef + '-' + String(d).padStart(2, '0'), inc });
    }
    const somaInc = diasRestantes.reduce((a, b) => a + b.inc, 0) || 1;
    diasRestantes.forEach((d) => { d.valor = restante * d.inc / somaInc; });
    const futuros = [];
    for (let i = 1; i <= 6; i++) { const m = addMes(mesRef, i); futuros.push({ mes: m, valor: nivel * S[m.slice(5)] }); }
    return { S, nivel, mtd, parcela: c, ritmo, sazonal, fechamento, restante, diasRestantes, futuros, mesRef, historico: meses.map((m) => ({ mes: m, valor: x(m) })) };
  }

  function pecas(D) {
    const ref = D.referencia, mesRef = ref.slice(0, 7);
    const janela = new Set([addMes(mesRef, -3), addMes(mesRef, -2), addMes(mesRef, -1), mesRef]);
    const P = abre(D.produtos);
    const chave = (r) => nomeLimpo(r.product_title) + '\u0001' + fisico(r.product_variant_title);
    const acc = new Map();
    const pega = (r) => {
      const k = chave(r); let a = acc.get(k);
      if (!a) { a = { id: k, produto: nomeLimpo(r.product_title), variante: fisico(r.product_variant_title), tamanho: tamanho(fisico(r.product_variant_title)), estampa: estampa(r.product_title), categoria: (r.product_type || '').trim() || 'Sem categoria', vendas_janela: 0, vendas_janela_fechada: 0, vendas_mes: 0, vendas_12m: 0, estoque: 0 }; acc.set(k, a); }
      if (!a.categoria || a.categoria === 'Sem categoria') a.categoria = (r.product_type || '').trim() || a.categoria;
      return a;
    };
    const ini12 = addMes(mesRef, -12);
    for (const r of P) {
      if (!r.product_title) continue;
      const m = String(r.month).slice(0, 7), u = r.net_items_sold || 0;
      if (m < ini12) continue;
      const a = pega(r);
      a.vendas_12m += u;
      if (janela.has(m)) a.vendas_janela += u;
      if (m === mesRef) a.vendas_mes += u;
      else if (janela.has(m)) a.vendas_janela_fechada += u;
    }
    for (const r of abre(D.estoque_ontem)) {
      if (!r.product_title) continue;
      const a = pega(r);
      a.estoque = Math.max(a.estoque, r.ending_inventory_units || 0);
    }
    return [...acc.values()];
  }

  // Projeta a demanda dia a dia a partir de amanhã para cada peça e calcula ruptura e compra.
  function calcula(D, opcoes) {
    const prazo = opcoes.prazo ?? 45, cobertura = opcoes.cobertura ?? 60;
    const L = loja(D, 'pecas'), G = loja(D, 'gmv');
    const itens = pecas(D);
    const totalJanela = itens.reduce((a, b) => a + Math.max(0, b.vendas_janela), 0) || 1;
    // demanda da loja por dia, de amanhã em diante (resto do mês + 6 meses)
    const dias = [];
    for (const d of L.diasRestantes) dias.push({ dia: d.dia, valor: d.valor });
    for (const f of L.futuros) { const nd = diasNoMes(f.mes); for (let i = 1; i <= nd; i++) dias.push({ dia: f.mes + '-' + String(i).padStart(2, '0'), valor: f.valor / nd }); }
    const horizonte = prazo + cobertura;
    const meses = [L.mesRef, ...L.futuros.map((f) => f.mes)];
    for (const it of itens) {
      const share = Math.max(0, it.vendas_janela) / totalJanela;
      it.share = share;
      it.prev_resto_mes = share * L.restante;
      it.prev_meses = Object.fromEntries(L.futuros.map((f) => [f.mes, share * f.valor]));
      let acc = 0, ruptura = null, demHoriz = 0;
      dias.forEach((d, i) => { acc += share * d.valor; if (ruptura == null && acc > it.estoque) ruptura = d.dia; if (i < horizonte) demHoriz += share * d.valor; });
      it.ruptura = it.estoque <= 0 && share > 0 ? 'agora' : ruptura;
      const diaria30 = dias.slice(0, 30).reduce((a, d) => a + share * d.valor, 0) / 30;
      it.cobertura_dias = diaria30 > 0 ? it.estoque / diaria30 : null;
      it.demanda_horizonte = demHoriz;
      it.comprar = Math.max(0, Math.ceil(demHoriz - it.estoque));
    }
    return { loja: L, gmv: G, itens, meses, prazo, cobertura, ref: D.referencia, primeiroDia: addDias(D.referencia, 1) };
  }

  raiz.Previsao = { calcula, loja, pecas, addMes, diasNoMes, addDias };
  if (typeof module !== 'undefined') module.exports = raiz.Previsao;
})(typeof window !== 'undefined' ? window : globalThis);
