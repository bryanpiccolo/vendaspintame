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
// 5. Produto/tamanho: participação de cada peça nas vendas dos 2 últimos meses fechados + mês atual, com dois
//    ajustes para o que saiu da curva normal da peça:
//    - ruptura: cada mês conta só os dias em que a peça tinha estoque (venda por dia disponível ÷ venda por dia
//      da loja), para a falta de estoque não derrubar a previsão;
//    - pico de promoção: o mês em que a peça vendeu mais de REGRAS.tetoPico × o normal dela nos outros meses
//      (sempre em relação à loja) fica limitado a esse teto.
//    Variantes de 6 e 12 canetinhas do mesmo tamanho e cor são a mesma peça física.
//    Ousadia: a venda prevista de cada peça é REGRAS.ousadia acima da projeção, para ter estoque para crescer.
// 4b. A curva diária do ano passado é suavizada: dias fora das datas fixas (Dia das Crianças, Black Friday e Natal)
//    que venderam mais que REGRAS.curva.alto × ou menos que REGRAS.curva.baixo × a mediana dos dias em volta
//    ficam no limite.
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
    const regras = [['passarinho', 'Voa Passarinho'], ['viagem colorida', 'Viagem Colorida'], ['dia de brincar', 'Dia de Brincar'], ['pets', 'Pets'], ['alfabeto', 'Alfabeto da PINTA'], ['caça-palavras', 'Alfabeto da PINTA'], ['copa do mundo', 'Copa do Mundo / Futebol'], ['futebol', 'Copa do Mundo / Futebol'], ['mergulho', 'Um Mergulho na Ilha'], ['frutaria', 'Frutaria'], ['natal', 'Natal'], ['tangram', 'Tangram'], ['vira!', 'VIRA!'], ['arvoredo', 'Tangram'], ['amarelinho', 'Copa do Mundo / Futebol']];
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

  const REGRAS = {
    mesesBase: 2, fatorST: [[0.75, 1.3], [0.5, 1.15]], variacaoFixa: { '2026-11': -0.40, '2026-12': -0.35 },
    ousadia: 0.10, // venda prevista por peça 10% acima da projeção
    tetoPico: 1.5, minDiasDisp: 7, // pico de promoção por peça; dias mínimos com estoque para o mês contar
    curva: { alto: 2, baixo: 0.5, raio: 7, datasFixas: [['09-25', '10-12'], ['11-20', '12-31']] },
  };
  // Suaviza a curva diária: fora das datas fixas, cada dia fica entre baixo × e alto × a mediana dos dias em volta.
  function suavizaCurva(porDia) {
    const C = REGRAS.curva, dias = [...porDia.keys()].sort(), out = new Map(porDia), ajustados = [];
    const fixo = (k) => C.datasFixas.some(([a, b]) => k.slice(5) >= a && k.slice(5) <= b);
    dias.forEach((k, i) => {
      if (fixo(k)) return;
      const viz = []; for (let j = Math.max(0, i - C.raio); j <= Math.min(dias.length - 1, i + C.raio); j++) if (j !== i) viz.push(porDia.get(dias[j]));
      if (viz.length < C.raio) return;
      viz.sort((a, b) => a - b); const med = viz[Math.floor(viz.length / 2)];
      if (!(med > 0)) return;
      const v = porDia.get(k), nv = Math.min(C.alto * med, Math.max(C.baixo * med, v));
      if (nv !== v) { out.set(k, nv); ajustados.push({ dia: k, antes: v, depois: nv }); }
    });
    return { mapa: out, ajustados };
  }

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
    const suave = suavizaCurva(new Map(D.diario_total.map((r) => [String(r.day).slice(0, 10), val(r)])));
    const porDia = suave.mapa;
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
      base, varBase, variacaoMesAtual: variacao(mesRef), jan, viradas, relJan, relacoes, fixos, variacoes, curvaAjustada: suave.ajustados,
      historico: meses.map((m) => ({ mes: m, valor: x(m) })),
      porMesJanela: Object.fromEntries([0, ...Array.from({ length: REGRAS.mesesBase }, (_, i) => i + 1)].map((i) => [addMes(mesRef, -i), x(addMes(mesRef, -i))])),
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
      if (!a) { a = { id: k, produto: nomeLimpo(r.product_title), variante: fisico(r.product_variant_title), tamanho: tamanho(fisico(r.product_variant_title)), estampa: estampa(r.product_title), categoria: categoriaDe(r.product_title, r.product_type), vendas_janela: 0, vendas_janela_fechada: 0, vendas_mes: 0, vendas_12m: 0, estoque: 0, skus: [], porMes: {}, semEstoque: {} }; acc.set(k, a); }
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
      if (janela.has(m)) { a.vendas_janela += u; a.porMes[m] = (a.porMes[m] || 0) + u; }
      if (m === mesRef) a.vendas_mes += u;
      else if (janela.has(m)) a.vendas_janela_fechada += u;
    }
    for (const r of comBling(abre(D.estoque_ontem), D.estoque_bling)) {
      if (!r.product_title) continue;
      const a = pega(r);
      a.estoque = Math.max(a.estoque, r.ending_inventory_units || 0);
      // divisão do Bling por depósito (Escritório abastece o Mercado Livre; Correios = Log + Floripa)
      if (r.esc != null) { a.esc = Math.max(a.esc || 0, r.esc); a.cor = Math.max(a.cor || 0, r.cor || 0); }
      if (r.codigo_bling) { a.codigos = a.codigos || []; if (!a.codigos.includes(r.codigo_bling)) a.codigos.push(r.codigo_bling); }
      const sku = String(r.product_variant_sku || '').trim();
      if (sku && !a.skus.includes(sku)) a.skus.push(sku);
    }
    // dias sem estoque por mês (D.dias_sem_estoque): a peça física está disponível se alguma variante dela estava
    if (D.dias_sem_estoque) {
      for (const r of abre(D.dias_sem_estoque)) {
        if (!r.product_title) continue;
        const m = String(r.month).slice(0, 7); if (!janela.has(m)) continue;
        const a = acc.get(chave(r)); if (!a) continue;
        const d = Math.max(0, Number(r.days_out_of_stock) || 0);
        a.semEstoque[m] = m in a.semEstoque ? Math.min(a.semEstoque[m], d) : d;
      }
    }
    return [...acc.values()];
  }

  // Participação da peça com ajuste de ruptura e de pico (regra 5). lojaMes: peças vendidas pela loja em cada mês.
  function shareAjustada(it, lojaMes, ref, temDisp) {
    const mesRef = ref.slice(0, 7), M = [];
    for (const m of Object.keys(lojaMes)) {
      const dias = m === mesRef ? +ref.slice(8, 10) : diasNoMes(m), loj = lojaMes[m];
      if (!(loj > 0)) continue;
      const v = Math.max(0, it.porMes[m] || 0);
      // vendeu no mês "todo sem estoque": a loja vende mesmo zerado (estoque negativo), então os dias não valem
      let fora = temDisp ? Math.min(dias, it.semEstoque[m] || 0) : 0; if (fora >= dias && v > 0) fora = 0;
      const disp = dias - fora;
      if (disp < Math.min(REGRAS.minDiasDisp, dias)) continue; // quase o mês todo sem estoque: o mês não diz nada
      const s0 = (v / disp) / (loj / dias); M.push({ m, disp, s: s0, s0, fora });
    }
    if (!M.length) return null;
    let pico = false;
    if (M.length >= 2) for (const x of M) {
      const outros = M.filter((y) => y !== x).map((y) => y.s0).sort((a, b) => a - b), n = outros.length;
      const med = n % 2 ? outros[(n - 1) / 2] : (outros[n / 2 - 1] + outros[n / 2]) / 2;
      if (med > 0 && x.s > REGRAS.tetoPico * med) { x.s = REGRAS.tetoPico * med; pico = true; }
    }
    const pd = M.reduce((a, x) => a + x.disp, 0);
    return { share: M.reduce((a, x) => a + x.s * x.disp, 0) / pd, pico, ruptura: M.some((x) => x.fora > 0) };
  }

  // Peça ativa: o título é de um produto ativo e algum SKU dela está num produto ativo (um rascunho pode ter o mesmo
  // título ou o mesmo SKU de um ativo). Sem SKU no estoque, vale só o título. Sem lista, todas valem.
  const plano = (s) => String(s || '').toUpperCase().replace(/[\s\-_.\/]/g, '');
  let cacheAtivos = null;
  function ativo(A, i) {
    if (!A || !A.skus || !A.skus.length) return true;
    if (!cacheAtivos || cacheAtivos.A !== A) cacheAtivos = { A, skus: new Set(A.skus.map(plano)), titulos: new Set((A.titulos || []).map(nomeLimpo)) };
    const skus = (i.skus || []).map(plano).filter(Boolean);
    if (cacheAtivos.titulos.size && !cacheAtivos.titulos.has(i.produto)) return false;
    return !skus.length || skus.some((s) => cacheAtivos.skus.has(s));
  }
  // Lista de ativos a partir dos produtos do arquivo de preços (scripts/precos_dados.mjs): [{t, v: [[sku, ...]]}].
  // Estoque físico pelo Bling (arquivo de scripts/bling_estoque.mjs): troca o estoque de cada SKU do Shopify pelo do Bling
  // e acrescenta as variantes ativas que não apareceram no relatório do Shopify. SKUs sem par no Bling ficam com o do Shopify.
  function comBling(rows, B) {
    if (!B || !Array.isArray(B.itens) || !B.itens.length) return rows;
    const pl = (s) => String(s == null ? '' : s).replace(/[\s\-_./]/g, '').toUpperCase();
    const m = new Map(B.itens.map((x) => [pl(x[2]), x]));
    const vistos = new Set(), mes = rows.length ? rows[0].month : null;
    const out = rows.map((r) => { const k = pl(r.product_variant_sku); const x = k && m.get(k); if (!x) return r; vistos.add(k); return { ...r, ending_inventory_units: x[3], esc: x[4], cor: x[5], codigo_bling: x[6] }; });
    for (const [k, x] of m) if (!vistos.has(k)) out.push({ month: mes, product_title: x[0], product_variant_title: x[1], product_variant_sku: x[2], ending_inventory_units: x[3], esc: x[4], cor: x[5], codigo_bling: x[6], inventory_units_sold: 0 });
    return out;
  }
  function ativosDe(produtos) {
    if (!Array.isArray(produtos) || !produtos.length) return null;
    return { skus: produtos.flatMap((p) => (p.v || []).map((v) => v[0]).filter(Boolean)), titulos: produtos.map((p) => p.t) };
  }

  // Projeta a demanda dia a dia a partir de amanhã para cada peça e calcula ruptura e compra.
  function calcula(D, opcoes) {
    const prazo = opcoes.prazo ?? 22, cobertura = opcoes.cobertura ?? 60;
    const L = loja(D, 'pecas'), G = loja(D, 'gmv');
    let itens = pecas(D);
    const totalJanela = itens.reduce((a, b) => a + Math.max(0, b.vendas_janela), 0) || 1;
    // peças vendidas pela loja em cada mês da janela (fechados pelo total mensal, o atual até ontem)
    const lojaMes = {}; for (const m of Object.keys(L.porMesJanela || {})) lojaMes[m] = L.porMesJanela[m];
    const temDisp = !!D.dias_sem_estoque, mult = 1 + REGRAS.ousadia;
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
      it.share_bruta = Math.max(0, it.vendas_janela) / totalJanela;
      const aj = it.vendas_janela > 0 ? shareAjustada(it, lojaMes, D.referencia, temDisp) : null;
      const share = aj ? aj.share : it.share_bruta;
      it.share = share; it.ajuste_pico = !!(aj && aj.pico); it.ajuste_ruptura = !!(aj && aj.ruptura);
      it.prev_resto_mes = share * L.restante * mult;
      it.prev_meses = Object.fromEntries(L.futuros.map((f) => [f.mes, share * f.valor * mult]));
      let acc = 0, ruptura = null, demHoriz = 0, demPrazo = 0, demCob = 0;
      dias.forEach((d, i) => { const q = share * d.valor * mult; acc += q; if (ruptura == null && acc > it.estoque) ruptura = d.dia; if (i < horizonte) demHoriz += q; if (i < prazo) demPrazo += q; else if (i < horizonte) demCob += q; });
      it.ruptura = it.estoque <= 0 && share > 0 ? 'agora' : ruptura;
      // estoque projetado no fim de cada mês (sem contar compras novas) e quantos dias ele cobre a partir dali
      it.fim_mes = {}; it.cob_fim = {};
      { let a = 0; const ult = dias.length ? dias[dias.length - 1].dia : null;
        for (const d of dias) {
          a += share * d.valor * mult;
          const k = d.dia.slice(0, 7);
          if (d.dia.slice(8) === String(diasNoMes(k)).padStart(2, '0')) {
            const resto = Math.max(0, it.estoque - a); it.fim_mes[k] = resto;
            it.cob_fim[k] = share <= 0 ? null : resto <= 0 ? 0 : ruptura && ruptura > d.dia ? Math.round((Date.parse(ruptura + 'T12:00:00Z') - Date.parse(d.dia + 'T12:00:00Z')) / 86400000) : (ult ? -Math.round((Date.parse(ult + 'T12:00:00Z') - Date.parse(d.dia + 'T12:00:00Z')) / 86400000) : null);
          }
        } }
      const diaria30 = dias.slice(0, 30).reduce((a, d) => a + share * d.valor * mult, 0) / 30;
      it.diaria30 = diaria30;
      it.cobertura_dias = diaria30 > 0 ? it.estoque / diaria30 : null;
      it.demanda_horizonte = demHoriz;
      it.sobra_chegada = Math.max(0, it.estoque - demPrazo);
      it.dem_cobertura = demCob;
      it.necessidade = demCob * it.fator;
      it.comprar = Math.max(0, Math.ceil(it.necessidade - it.sobra_chegada));
    }
    // Só produtos ativos no Shopify (sem rascunhos e arquivados), quando a lista de ativos veio junto (D.ativos).
    // A participação de cada peça é calculada antes, com todas, para não inflar a previsão das que ficam.
    itens = itens.filter((i) => ativo(D.ativos, i));
    return { loja: L, gmv: G, itens, dias, meses, chegada: dias[prazo - 1] ? addDias(D.referencia, prazo) : null, fimCobertura: addDias(D.referencia, prazo + cobertura), cortesST: cortes, prazo, cobertura, ref: D.referencia, primeiroDia: addDias(D.referencia, 1) };
  }


  // Transferência Correios -> Escritório (o escritório abastece o Mercado Livre). Usada pela aba Estoque e pelo
  // e-mail de alerta (scripts/transferencia_email.mjs). D: dados (estoque_bling com depósitos, ml_vendas, precos/ml_anuncios,
  // diario_total); R: resultado de calcula(). o.dias: dias de cobertura no escritório; o.reserva: dias do site guardados nos Correios.
  function transferenciaML(D, R, o) {
    o = o || {};
    const B = D.estoque_bling, M = D.ml_vendas;
    if (!B || !B.depositos || !M || !Array.isArray(M.pedidos)) return null;
  const pl = (s) => String(s == null ? '' : s).replace(/[\s\-_./]/g, '').toUpperCase();
  const hojeEst = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(B.gerado_em));
  const N = o.dias || 30, RESERVA = o.reserva == null ? 30 : o.reserva;
  // 28 dias de venda do ML até o último dia completo do arquivo
  const fim = M.ate || D.referencia, ini = addDias(fim, -27);
  const v28 = new Map(), v7 = new Map(), nome = new Map(), ini7 = addDias(fim, -6);
  for (const p of M.pedidos) {
    if (p.data < ini || p.data > fim) continue;
    for (const [c, q, d] of p.itens) { const k = pl(c); if (!k) continue; v28.set(k, (v28.get(k) || 0) + q); if (p.data >= ini7) v7.set(k, (v7.get(k) || 0) + q); if (!nome.has(k)) nome.set(k, d); }
  }
  // estoque por depósito de cada código (as variantes de 6 e 12 canetinhas apontam para a mesma peça)
  const est = new Map();
  for (const x of B.itens) { const k = x[6] && pl(x[6]); if (!k || x[4] == null || est.has(k)) continue; est.set(k, { esc: x[4], cor: x[5], prod: x[0], var: x[1] }); }
  // sazonalidade: venda prevista da loja por dia nos próximos N dias ÷ venda real por dia nos 28 dias do ML
  const real = (D.diario_total || []).filter((d) => d.day >= ini && d.day <= fim).reduce((a, d) => a + (d.net_items_sold || 0), 0) / 28;
  const prevLoja = R.dias.slice(0, N).reduce((a, d) => a + d.valor, 0) / Math.max(1, Math.min(N, R.dias.length));
  const saz = real > 0 ? Math.max(0.5, Math.min(3, prevLoja / real)) : 1;
  const mult = 1 + REGRAS.ousadia;
  // mínimo no escritório: 2 de cada peça/tamanho; 3 se vendeu no ML nos 28 dias (ou a previsão, se for maior)
  const MIN = 2, MIN_VENDA = 3;
  // peças que entram no sortimento do ML sem estar na planilha de anúncios, com o estoque inicial no escritório por tamanho
  // (pedido da Melina em 28/10: Tangram, Arvoredo, Sorvete, Dinos e Obras de Arte)
  const INICIAL = { '02': 2, '04': 3, '06': 3, '08': 3, '10': 2 };
  const ML_EXTRA = { VETA: INICIAL, CATA: INICIAL, CAAR: INICIAL, CASOR: INICIAL, CADI: INICIAL, CAOA: INICIAL };
  const minExtra = (k) => { for (const p in ML_EXTRA) if (k.startsWith(p) && ML_EXTRA[p][k.slice(p.length)] != null) return ML_EXTRA[p][k.slice(p.length)]; return null; };
  const limpa = (e) => (e.prod.replace(/ Infantil para (Colorir|Pintar)| para (Colorir|Pintar)| Infantil|\s*\+\s*\d*\s*canetinhas/gi, '').replace(/\s+/g, ' ').trim() + (e.var && e.var !== 'Default Title' ? ' ' + e.var.split('/').map((x) => x.trim()).filter((x, i) => x && !/canetinha|gr[áa]tis|\+\s*\d/i.test(x) && !(i > 0 && /^(0?6|12)$/.test(x))).join(' ') : '')).trim();
  // fora do mínimo: o que não é peça (copo, livro, kits de canetinhas, embalagem), a não ser que venda no ML
  const FORA_MIN = /^copo|^livro|^kit de \d+ canetinhas|embalagem|envelope/i;
  // sortimento do ML: códigos da planilha de anúncios do ML (aba Precificação; código "pai" vale para todos os tamanhos)
  // + tudo que já vendeu no ML. O que não está no ML não entra.
  const AN = D.ml_anuncios || (D.precos && D.precos.listings && D.precos.listings.ml) || null;
  const anuncios = AN && AN.items ? Object.keys(AN.items).map(pl).filter(Boolean) : [];
  const vendeuML = new Set(); for (const p of M.pedidos) for (const [c] of p.itens) vendeuML.add(pl(c));
  const noML = (k) => vendeuML.has(k) || minExtra(k) != null || anuncios.some((a) => k === a || (k.startsWith(a) && /^\d{2}$|^(PP|P|M|G|GG)$/.test(k.slice(a.length))));
  const cods = new Set([...v28.keys(), ...[...est.keys()].filter((k) => noML(k) && !FORA_MIN.test(est.get(k).prod))]);
  // venda do site por dia em cada código (a previsão da aba; o site sai dos Correios)
  const site = new Map();
  for (const i of R.itens) { const c = i.codigos && i.codigos.length === 1 ? pl(i.codigos[0]) : null; if (c) site.set(c, (site.get(c) || 0) + (i.diaria30 || 0)); }
  let rows = [...cods].map((k) => {
    const e = est.get(k) || null, v = v28.get(k) || 0;
    // ritmo: a média dos 28 dias, ou, se acelerou, a média com a última semana contando em dobro (o estoque sobe junto)
    const w = v7.get(k) || 0, ritmo = Math.max(v / 28, (v + w) / 35), subiu = w / 7 > v / 28 * 1.2 && w >= 2;
    const prev = ritmo * saz * mult * N, minBase = Math.max(v > 0 ? MIN_VENDA : MIN, minExtra(k) || 0), alvo = Math.max(minBase, Math.ceil(prev - 0.05));
    const esc = e ? e.esc : null, cor = e ? e.cor : null;
    const falta = e ? Math.max(0, alvo - esc) : null;
    // Correios precisa guardar a venda do site dos próximos RESERVA dias. Se não dá para os dois, divide o estoque total
    // na proporção da venda de cada canal (ML × site); peça que não vende no ML fica nos Correios.
    const sd = site.get(k) || 0, reserva = Math.ceil(sd * RESERVA - 0.05);
    let transf = e ? Math.min(cor, falta) : null, dividido = false;
    if (e && transf > 0 && cor - transf < reserva) {
      const tot = esc + cor, mlD = v > 0 ? ritmo * saz * mult : (minExtra(k) != null ? minExtra(k) / N : 0);
      const alvoDiv = mlD + sd > 0 ? Math.round(tot * mlD / (mlD + sd)) : 0;
      transf = Math.max(0, Math.min(transf, alvoDiv - esc, cor - Math.min(reserva, Math.max(0, tot - alvoDiv))));
      dividido = true;
    }
    const mlDia = ritmo * saz * mult, diasEsc = mlDia > 0 && v > 0 ? (esc || 0) / mlDia : null;
    return { k, minBase, novoML: minExtra(k) != null && v === 0, sd, mlDia, diasEsc, reserva, dividido, nome: (nome.get(k) || (e ? limpa(e) : k)).replace(/\s+/g, ' ').trim(), v, w, subiu, prev, alvo, esc, cor, transf, curto: e && v > 0 ? Math.max(0, falta - cor) : 0 };
  });
  const totT = rows.reduce((a, r) => a + (r.transf || 0), 0), nT = rows.filter((r) => r.transf > 0).length;
  const semTudo = rows.filter((r) => r.curto > 0), divs = rows.filter((r) => r.dividido);
  rows.sort((a, b) => (b.transf || 0) - (a.transf || 0) || (b.curto || 0) - (a.curto || 0) || b.v - a.v || a.nome.localeCompare(b.nome, 'pt-BR'));
  const ate = addDias(addDias(hojeEst, -1), N);
    rows.sort((a, b) => (b.transf || 0) - (a.transf || 0) || (b.curto || 0) - (a.curto || 0) || b.v - a.v || a.nome.localeCompare(b.nome, 'pt-BR'));
    return { rows, saz, mult, ini, fim, ate, hoje: hojeEst, N, RESERVA, AN, MIN, MIN_VENDA };
  }

  raiz.Previsao = { REGRAS, calcula, transferenciaML, ativosDe, comBling, loja, pecas, addMes, diasNoMes, addDias };
  if (typeof module !== 'undefined') module.exports = raiz.Previsao;
})(typeof window !== 'undefined' ? window : globalThis);
