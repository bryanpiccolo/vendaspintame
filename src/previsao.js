// Previsão de vendas e de ruptura de estoque (só vendas do site/Shopify).
//
// Regras (as mesmas mostradas na aba Estoque, em "Premissas"):
// 1. Queda contra o ano passado: a dos 2 últimos meses fechados somados. Meses com variação definida
//    (REGRAS.variacaoFixa) usam essa variação; os demais ficam no meio do caminho, em linha reta, até zerar
//    (vender igual ao ano passado) no próximo janeiro.
//    Mês futuro até dezembro = mesmo mês do ano passado × (1 + variação do mês).
// 2. Janeiro = previsão de dezembro × média da relação janeiro/dezembro dos 2 últimos viradas de ano,
//    nunca abaixo do janeiro do ano passado.
// 3. Depois de janeiro: cada mês = mês anterior × média de quanto esse mês vendeu sobre o anterior
//    nos 2 últimos anos com dados (2025 e 2026).
// 4. Mês corrente: curva diária do mesmo mês do ano passado (datas como Dia das Crianças e Black Friday).
//    O fechamento junta o ritmo do mês (vendido até ontem ÷ parte que costuma estar vendida) com a regra 1,
//    dando mais peso ao ritmo conforme o mês avança. Os dias seguintes seguem a mesma curva.
// 5. Produto/tamanho: participação de cada peça nas vendas dos 2 últimos meses fechados + mês atual.
//    Variantes de 6 e 12 canetinhas do mesmo tamanho e cor são a mesma peça física.
// 6. Ruptura: dia em que a venda prevista acumulada passa o estoque de hoje.
// 7. A compra chega depois do prazo de reposição. Comprar = venda prevista nos dias de cobertura depois da
//    chegada × fator de sell-through − estoque que ainda sobra no dia da chegada.
//    Sell-through da peça = vendas da janela ÷ (vendas da janela + estoque de hoje); quartil de cima × 1,3,
//    segundo quartil × 1,15, demais × 1.
(function (raiz) {
  const TXT = new Set(['product_type', 'product_title', 'product_variant_title', 'product_variant_sku']);
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
  const categoriaDe = (titulo, tipo) => {
    const t = String(titulo || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const regras = [[/^camiseta adulto/, 'Camiseta Adulto'], [/^camiseta/, 'Camiseta Infantil'], [/^vestido/, 'Vestido Infantil'], [/^cropped/, 'Cropped Infantil'], [/^blusa/, 'Blusa Infantil'], [/^cal[cç]a/, 'Calça Infantil'], [/^bermuda/, 'Bermuda Infantil'], [/^short/, 'Short Saia Infantil'], [/^moletom/, 'Moletom Infantil'], [/^t[eê]nis/, 'Tênis'], [/^estojo/, 'Estojo'], [/mochila|lancheira/, 'Mochila e Lancheira'], [/^meia/, 'Meia'], [/boneca|boneco|de pano/, 'Boneca de Pano'], [/^kit de \d+ canetinhas/, 'Canetinhas'], [/embalagem|envelope|box presente/, 'Embalagem'], [/bandeirola/, 'Decoração'], [/^livro/, 'Livro'], [/kit conjunto escolar/, 'Kit Escolar'], [/lista vip|^kit /, 'Kit'], [/scrunchie|copo/, 'Acessório'], [/teste/, 'Teste']];
    for (const [re, c] of regras) if (re.test(t)) return c;
    return tipo ? String(tipo).trim() : 'Sem categoria';
  };

  const REGRAS = { mesesBase: 2, fatorST: [[0.75, 1.3], [0.5, 1.15]], variacaoFixa: { '2026-11': -0.40, '2026-12': -0.35 } };

  function loja(D, metrica) {
    const val = (r) => metrica === 'pecas' ? (r.net_items_sold || 0) : (r.gross_sales || 0) + (r.discounts || 0) + (r.shipping_charges || 0);
    const ref = D.referencia, mesRef = ref.slice(0, 7), diaRef = +ref.slice(8, 10);
    const serie = new Map(D.mensal.map((r) => [String(r.month).slice(0, 7), val(r)]));
    const meses = [...serie.keys()].sort();
    const x = (k) => serie.get(k) || 0;
    const fimMes = diaRef === diasNoMes(mesRef);
    const ultFechado = fimMes ? mesRef : addMes(mesRef, -1);
    // 1. variação dos últimos meses fechados contra o ano anterior
    const base = []; for (let i = 0; i < REGRAS.mesesBase; i++) base.push(addMes(ultFechado, -i));
    const somaB = base.reduce((a, m) => a + x(m), 0), somaLy = base.reduce((a, m) => a + x(addMes(m, -12)), 0);
    const varBase = somaLy > 0 ? somaB / somaLy - 1 : 0;
    // próximo janeiro depois do último mês fechado
    let jan = addMes(ultFechado, 1); while (jan.slice(5) !== '01') jan = addMes(jan, 1);
    let passos = 0; for (let m = ultFechado; m < jan; m = addMes(m, 1)) passos++;
    // pontos fixos: último mês fechado (queda de base), meses com variação definida e janeiro (zero)
    const idx = (m) => { let i = 0; for (let k = ultFechado; k < m; k = addMes(k, 1)) i++; return i; };
    const pontos = [[0, varBase]];
    for (const [m, v] of Object.entries(REGRAS.variacaoFixa)) if (m > ultFechado && m < jan) pontos.push([idx(m), v]);
    pontos.push([passos, varBase < 0 ? 0 : varBase]);
    pontos.sort((a, b) => a[0] - b[0]);
    const variacao = (m) => {
      const i = idx(m);
      for (let k = 1; k < pontos.length; k++) {
        const [i0, v0] = pontos[k - 1], [i1, v1] = pontos[k];
        if (i <= i1) return i1 === i0 ? v1 : v0 + (v1 - v0) * (i - i0) / (i1 - i0);
      }
      return pontos[pontos.length - 1][1];
    };
    const fixos = Object.entries(REGRAS.variacaoFixa).filter(([m]) => m > ultFechado && m < jan);
    // 2. relação janeiro/dezembro das 2 últimas viradas de ano com dados
    const viradas = [];
    for (let y = +jan.slice(0, 4) - 1; y >= 2020 && viradas.length < 2; y--) { const j = y + '-01', d = (y - 1) + '-12'; if (x(j) > 0 && x(d) > 0) viradas.push({ jan: j, dez: d, r: x(j) / x(d) }); }
    const relJan = viradas.length ? viradas.reduce((a, v) => a + v.r, 0) / viradas.length : 1;
    // 3. depois de janeiro: relação de cada mês com o anterior nos 2 últimos anos com os dois meses fechados
    const relMes = (m) => {
      const rs = [];
      for (let y = +m.slice(0, 4) - 1; y >= 2020 && rs.length < 2; y--) {
        const a = y + '-' + m.slice(5), b = addMes(a, -1);
        if (a <= ultFechado && x(a) > 0 && x(b) > 0) rs.push({ ano: y, r: x(a) / x(b) });
      }
      return rs;
    };
    const relacoes = new Map();
    const prev = new Map(), variacoes = new Map();
    const horizonteFim = addMes(mesRef, 6);
    for (let m = addMes(ultFechado, 1); m <= horizonteFim; m = addMes(m, 1)) {
      let v;
      if (m < jan) { const vr = variacao(m); v = x(addMes(m, -12)) * (1 + vr); }
      else if (m === jan) { v = Math.max(prev.get(addMes(jan, -1)) * relJan, x(addMes(jan, -12))); }
      else { const rs = relMes(m); relacoes.set(m, rs); const f = rs.length ? rs.reduce((a, b) => a + b.r, 0) / rs.length : 1; v = prev.get(addMes(m, -1)) * f; }
      prev.set(m, v);
      const ly = x(addMes(m, -12)); variacoes.set(m, ly > 0 ? v / ly - 1 : null);
    }
    // 4. curva diária do mesmo mês do ano passado
    const porDia = new Map(D.diario_total.map((r) => [String(r.day).slice(0, 10), val(r)]));
    const pesosDia = (m) => {
      const nd = diasNoMes(m), ly = addMes(m, -12), ndl = diasNoMes(ly), v = [];
      let ok = true;
      for (let d = 1; d <= nd; d++) { const k = ly + '-' + String(Math.min(d, ndl)).padStart(2, '0'); if (!porDia.has(k)) { ok = false; break; } v.push(Math.max(0, porDia.get(k))); }
      const tot = v.reduce((a, b) => a + b, 0);
      return ok && tot > 0 ? v.map((y) => y / tot) : Array(nd).fill(1 / nd);
    };
    const ndRef = diasNoMes(mesRef), pRef = pesosDia(mesRef);
    const mtd = fimMes ? 0 : x(mesRef);
    let fechamento = 0, restante = 0, c = 1, ritmo = 0, sazonal = 0;
    const diasRestantes = [];
    if (!fimMes) {
      c = Math.min(0.999, Math.max(0.001, pRef.slice(0, diaRef).reduce((a, b) => a + b, 0)));
      sazonal = prev.get(mesRef); ritmo = mtd / c;
      fechamento = c * ritmo + (1 - c) * sazonal;
      restante = Math.max(0, fechamento - mtd);
      const resto = pRef.slice(diaRef), sr = resto.reduce((a, b) => a + b, 0) || 1;
      resto.forEach((w, i) => diasRestantes.push({ dia: mesRef + '-' + String(diaRef + 1 + i).padStart(2, '0'), valor: restante * w / sr }));
      prev.set(mesRef, fechamento);
      const ly = x(addMes(mesRef, -12)); variacoes.set(mesRef, ly > 0 ? fechamento / ly - 1 : null);
    }
    const futuros = [];
    for (let i = 1; i <= 6; i++) { const m = addMes(mesRef, i); futuros.push({ mes: m, valor: prev.get(m), variacao: variacoes.get(m), pesos: pesosDia(m) }); }
    return {
      mtd, parcela: c, ritmo, sazonal, fechamento, restante, diasRestantes, futuros, mesRef, ultFechado,
      base, varBase, variacaoMesAtual: variacao(mesRef), jan, viradas, relJan, relacoes, fixos, variacoes,
      historico: meses.map((m) => ({ mes: m, valor: x(m) })),
    };
  }

  function pecas(D) {
    const ref = D.referencia, mesRef = ref.slice(0, 7);
    const janela = new Set([mesRef]); for (let i = 1; i <= REGRAS.mesesBase; i++) janela.add(addMes(mesRef, -i));
    const P = abre(D.produtos);
    const chave = (r) => nomeLimpo(r.product_title) + '\u0001' + fisico(r.product_variant_title);
    const acc = new Map();
    const pega = (r) => {
      const k = chave(r); let a = acc.get(k);
      if (!a) { a = { id: k, produto: nomeLimpo(r.product_title), variante: fisico(r.product_variant_title), tamanho: tamanho(fisico(r.product_variant_title)), estampa: estampa(r.product_title), categoria: categoriaDe(r.product_title, r.product_type), vendas_janela: 0, vendas_janela_fechada: 0, vendas_mes: 0, vendas_12m: 0, estoque: 0, skus: [] }; acc.set(k, a); }
      if (a.categoria === 'Sem categoria' && r.product_type) a.categoria = categoriaDe(r.product_title, r.product_type);
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
      const sku = String(r.product_variant_sku || '').trim();
      if (sku && !a.skus.includes(sku)) a.skus.push(sku);
    }
    return [...acc.values()];
  }

  // Projeta a demanda dia a dia a partir de amanhã para cada peça e calcula ruptura e compra.
  function calcula(D, opcoes) {
    const prazo = opcoes.prazo ?? 22, cobertura = opcoes.cobertura ?? 60;
    const L = loja(D, 'pecas'), G = loja(D, 'gmv');
    const itens = pecas(D);
    const totalJanela = itens.reduce((a, b) => a + Math.max(0, b.vendas_janela), 0) || 1;
    // demanda da loja por dia, de amanhã em diante (resto do mês + 6 meses)
    const dias = [];
    for (const d of L.diasRestantes) dias.push({ dia: d.dia, valor: d.valor });
    for (const f of L.futuros) f.pesos.forEach((w, i) => dias.push({ dia: f.mes + '-' + String(i + 1).padStart(2, '0'), valor: f.valor * w }));
    const horizonte = prazo + cobertura;
    const meses = [L.mesRef, ...L.futuros.map((f) => f.mes)];
    // sell-through da janela e fator de compra por quartil
    for (const it of itens) it.sell_through = it.vendas_janela > 0 ? it.vendas_janela / (it.vendas_janela + Math.max(0, it.estoque)) : null;
    const sts = itens.map((i) => i.sell_through).filter((v) => v != null).sort((a, b) => a - b);
    const quantil = (q) => sts.length ? sts[Math.min(sts.length - 1, Math.floor(q * sts.length))] : 1;
    const cortes = REGRAS.fatorST.map(([q, f]) => [quantil(q), f]);
    for (const it of itens) it.fator = it.sell_through == null ? 1 : (cortes.find(([c]) => it.sell_through >= c) || [0, 1])[1];
    for (const it of itens) {
      const share = Math.max(0, it.vendas_janela) / totalJanela;
      it.share = share;
      it.prev_resto_mes = share * L.restante;
      it.prev_meses = Object.fromEntries(L.futuros.map((f) => [f.mes, share * f.valor]));
      let acc = 0, ruptura = null, demHoriz = 0, demPrazo = 0, demCob = 0;
      dias.forEach((d, i) => { const q = share * d.valor; acc += q; if (ruptura == null && acc > it.estoque) ruptura = d.dia; if (i < horizonte) demHoriz += q; if (i < prazo) demPrazo += q; else if (i < horizonte) demCob += q; });
      it.ruptura = it.estoque <= 0 && share > 0 ? 'agora' : ruptura;
      const diaria30 = dias.slice(0, 30).reduce((a, d) => a + share * d.valor, 0) / 30;
      it.cobertura_dias = diaria30 > 0 ? it.estoque / diaria30 : null;
      it.demanda_horizonte = demHoriz;
      it.sobra_chegada = Math.max(0, it.estoque - demPrazo);
      it.dem_cobertura = demCob;
      it.necessidade = demCob * it.fator;
      it.comprar = Math.max(0, Math.ceil(it.necessidade - it.sobra_chegada));
    }
    return { loja: L, gmv: G, itens, dias, meses, chegada: dias[prazo - 1] ? addDias(D.referencia, prazo) : null, fimCobertura: addDias(D.referencia, prazo + cobertura), cortesST: cortes, prazo, cobertura, ref: D.referencia, primeiroDia: addDias(D.referencia, 1) };
  }

  raiz.Previsao = { REGRAS, calcula, loja, pecas, addMes, diasNoMes, addDias };
  if (typeof module !== 'undefined') module.exports = raiz.Previsao;
})(typeof window !== 'undefined' ? window : globalThis);
