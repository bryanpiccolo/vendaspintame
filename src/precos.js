// Aba Precificação: o painel do "Controle de Precificação" (preço e margem por canal, com as mesmas regras e a
// mesma conciliação de anúncios) + estoque atual e cobertura de cada produto, pela previsão da aba Estoque.
// Só leitura: importações, regras e conciliação continuam sendo feitas no Controle de Precificação.
// Recebe os dados por PrecosAba.define(X): { gerado_em, rules, listings, sales, manual, links, shipML,
//   produtos: [{ t: título, ty: tipo, v: [[sku, variação, preço, custo, peso kg]] }] }.
(function () {
  'use strict';
  let X = null, M = null;
  const st = { q: '', f: 'all', c: 'all', cat: 'all', sort: 'minm', abertos: new Set() };
  const aba = () => document.getElementById('aba-precos');

  // ---------- helpers ----------
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const fmtR = (v) => v == null || !isFinite(v) ? '—' : BRL.format(v);
  const fmtR0 = (v) => v == null || !isFinite(v) ? '—' : 'R$ ' + INT.format(v);
  const fmtP = (v) => v == null || !isFinite(v) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const dataBR = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
  const quando = (ts) => { if (!ts) return ''; const d = new Date(ts); return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d); };
  const normSku = (s) => String(s ?? '').trim().toUpperCase();
  const plano = (s) => normSku(s).replace(/[\s\-_.\/]/g, '');
  const cleanTitle = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const deacc = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ---------- conciliação (igual ao Controle de Precificação) ----------
  const STOP = new Set('para pintar colorir algodao canetinhas canetinha de da do das dos e com kit a o voa the'.split(' '));
  const CATS = ['vestido', 'camiseta', 'blusa', 'cropped', 'calca', 'moletom', 'short', 'estojo', 'lancheira', 'mochila', 'meia', 'livro', 'scrunchie', 'embalagem', 'canetinhas'];
  const SHAPE = new Set(['infantil', 'adulto', 'bolso', 'frufru', 'canguru', 'saia', 'big', 'mini', 'soquete']);
  const tokens = (t) => deacc(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
  const titleKey = (t) => tokens(t).join(' ') || deacc(t).trim();
  function titleScore(a, b) {
    const A = tokens(a), B = tokens(b);
    const ca = CATS.find((c) => A.includes(c)), cb = CATS.find((c) => B.includes(c));
    if (ca !== cb) return 0;
    const SA = new Set(A), SB = new Set(B);
    const ea = [...SA].filter((x) => !CATS.includes(x) && !SHAPE.has(x)), eb = [...SB].filter((x) => !CATS.includes(x) && !SHAPE.has(x));
    if (ea.length && eb.length && !ea.some((x) => SB.has(x))) return 0;
    let inter = 0; for (const x of SA) if (SB.has(x)) inter++;
    return inter / (SA.size + SB.size - inter || 1);
  }
  function skuBases(s) {
    const x = plano(s), out = new Set(); if (!x) return out;
    const roots = [x]; if (/^K[A-Z]/.test(x)) roots.push(x.slice(1));
    for (const y of roots) {
      out.add(y);
      for (const re of [/(\d{2})(06|6|12)$/, /\d{2}$/, /(06|12)$/, /(PP|P|M|G|GG|XG)(12)?$/]) { const z = y.replace(re, ''); if (z !== y && z.length >= 4) out.add(z); }
    }
    return out;
  }
  function catFromTitle(t) {
    const d = deacc(t);
    const map = [['vestido', 'Vestido Infantil'], ['cropped', 'Cropped Infantil'], ['short saia', 'Short Saia Infantil'], ['calca', 'Calça Infantil'], ['moletom', 'Moletom Infantil'], ['blusa', 'Blusa Infantil'], ['estojo', 'Estojo'], ['livro', 'Livro'], ['embalagem', 'Embalagem'], ['canetinha', 'Material de Pintura'], ['lancheira', 'Acessório'], ['mochila', 'Acessório'], ['meia', 'Acessório'], ['scrunchie', 'Acessório']];
    if (d.includes('camiseta')) return d.includes('adulto') ? 'Camiseta Adulto' : 'Camiseta Infantil';
    for (const [k, v] of map) if (d.includes(k)) return v;
    return 'Outros';
  }
  const moda = (arr) => { if (!arr.length) return null; const c = {}; let best = arr[0]; for (const x of arr) { c[x] = (c[x] || 0) + 1; if (c[x] > c[best]) best = x; } return best; };
  function produtosShopify() {
    const map = new Map();
    for (const p of X.produtos || []) {
      const key = 's:' + titleKey(p.t);
      let g = map.get(key);
      if (!g) { g = { key, title: cleanTitle(p.t), cat: p.ty || catFromTitle(p.t), prices: [], cmvs: [], ws: [], skus: [], bases: new Set(), src: 'shopify', variants: 0 }; map.set(key, g); }
      const vs = (p.v || []).map(([sku, vt, pr, c, w]) => ({ sku, vt, p: pr, c, w })).filter((v) => v.p != null);
      if (!vs.length) continue;
      const is6 = (v) => { const parts = String(v.vt || '').split('/').map((x) => x.trim()); return parts.length > 1 && /^0?6\b/.test(parts[parts.length - 1]); };
      const six = vs.filter(is6);
      const base = (six.length ? six : vs).reduce((a, b) => (b.p < a.p ? b : a));
      g.prices.push(base.p); if (base.c != null) g.cmvs.push(base.c); if (base.w) g.ws.push(base.w);
      g.variants += vs.length;
      for (const v of vs) if (v.sku) { g.skus.push(normSku(v.sku)); for (const b of skuBases(v.sku)) g.bases.add(b); }
    }
    return [...map.values()].map((g) => ({ ...g, price: moda(g.prices), shopifyCmv: moda(g.cmvs), w: moda(g.ws), priceSpread: new Set(g.prices).size > 1 }));
  }
  function indice(products) {
    const exact = new Map(), base = new Map();
    for (const p of products) {
      for (const s of p.skus) exact.set(plano(s), p.key);
      for (const b of p.bases) { if (!base.has(b)) base.set(b, new Set()); base.get(b).add(p.key); }
    }
    return { exact, base };
  }
  function liga(chId, sku, item, products, idx) {
    const link = (X.links || {})[chId + '|' + sku];
    if (link === '__ignore__') return { key: null, how: 'ignorado' };
    if (link === '__solo__') return { key: null, how: 'sem vínculo' };
    if (link && products.some((p) => p.key === link)) return { key: link, how: 'manual' };
    const f = plano(sku);
    if (idx.exact.has(f)) return { key: idx.exact.get(f), how: 'SKU' };
    for (const b of skuBases(sku)) { const s = idx.base.get(b); if (s && s.size === 1) return { key: [...s][0], how: 'SKU' }; }
    if (item && item.t) {
      let best = null, bs = 0, second = 0;
      for (const p of products) { const s = titleScore(item.t, p.title); if (s > bs) { second = bs; bs = s; best = p; } else if (s > second) second = s; }
      if (best && bs >= 0.5 && bs - second >= 0.1) return { key: best.key, how: 'título', score: bs };
    }
    return { key: null, how: 'sem vínculo' };
  }
  function freteML(sku) {
    const items = X.shipML && X.shipML.items; if (!items) return null;
    const k = normSku(sku); if (items[k]) return items[k].f;
    const base = k.replace(/\d{2}$/, ''), vals = [];
    for (const [s, v] of Object.entries(items)) if (s === base || s.replace(/\d{2}$/, '') === base) vals.push(v.f);
    return vals.length ? Math.max(...vals) : null;
  }

  // ---------- taxas (igual ao Controle de Precificação) ----------
  function taxas(ch, Plist, w, item) {
    const P = Plist * (1 - (+ch.desconto || 0) / 100);
    const r = X.rules, out = { Pn: P, desconto: Plist - P, ads: P * (+ch.ads || 0) / 100, com: 0, fixo: 0, frete: 0, gateway: 0, imposto: P * (+r.imposto || 0) / 100, missing: [], notes: [] };
    if (ch.kind === 'site') {
      const mix = ch.mixPix == null ? null : (+ch.mixPix || 0) / 100;
      const pct = mix == null ? (+ch.gatewayPct || 0) : mix * (+ch.taxaPix || 0) + (1 - mix) * (+ch.taxaCartao || 0);
      out.gateway = P * pct / 100 + (+ch.gatewayFixo || 0);
      const real = ch.freteCustoReal == null || ch.freteCustoReal === '' ? null : +ch.freteCustoReal;
      const gratis = +ch.freteGratisAPartir > 0 && P >= +ch.freteGratisAPartir;
      if (gratis) { if (real == null) out.missing.push('custo do frete'); else out.frete = real; out.notes.push('frete grátis'); }
      else if (real != null) out.frete = Math.max(0, real - (+ch.freteCobrado || 0));
    } else if (ch.kind === 'ml') {
      const ty = String((item && item.ty) || ch.tipoPadrao || 'classico').toLowerCase();
      const premium = ty.includes('prem') || ty.includes('gold_pro');
      out.com = P * (premium ? +ch.comPremium : +ch.comClassico) / 100;
      out.notes.push(premium ? 'Premium' : 'Clássico');
      if (P < +ch.limiteFrete) {
        const tier = (ch.taxaFixa || []).filter((t) => t.ate != null).sort((a, b) => a.ate - b.ate).find((t) => P < +t.ate);
        out.fixo = tier ? +tier.valor || 0 : 0;
      } else if (item && item.f != null) out.frete = item.f;
      else {
        const row = w == null ? null : (ch.freteTabela || []).filter((t) => t.ateKg != null).sort((a, b) => a.ateKg - b.ateKg).find((t) => w <= +t.ateKg);
        if (row && row.valor != null && row.valor !== '') out.frete = +row.valor; else out.missing.push(w == null ? 'peso' : 'frete ML');
      }
    } else if (ch.kind === 'shopee') {
      const f = (ch.faixas || []).find((t) => t.ate == null || P <= +t.ate) || { pct: 0, fixo: 0 };
      out.com = P * (+f.pct || 0) / 100; out.fixo = (+f.fixo || 0) + (+ch.extraItem || 0);
      const custo = ch.freteCusto == null || ch.freteCusto === '' ? null : +ch.freteCusto;
      const sub = (ch.subsidios || []).find((t) => t.ate == null || P <= +t.ate);
      if (custo != null) { out.frete = Math.max(0, custo - (sub ? +sub.valor || 0 : 0)); if (!out.frete) out.notes.push('frete coberto pela Shopee'); }
      else out.frete = +ch.frete || 0;
    } else { out.com = P * (+ch.pct || 0) / 100; out.fixo = +ch.fixo || 0; out.frete = +ch.frete || 0; }
    return out;
  }
  function calc(ch, P, row, item) {
    const f = taxas(ch, P, row.w, item);
    const missing = [...f.missing]; if (row.cmv == null) missing.push('CMV');
    const lucro = f.Pn - (f.com + f.fixo + f.frete + f.gateway + f.imposto + f.ads + (row.cmv || 0));
    return { P, ...f, cmv: row.cmv, lucro, margem: f.Pn > 0 ? lucro / f.Pn : null, bruta: row.cmv != null && P > 0 ? (P - row.cmv) / P : null, missing };
  }
  function precoMinimo(ch, row, item) {
    const alvo = (+X.rules.alvo || 0) / 100;
    if (row.cmv == null || alvo >= 1) return null;
    for (let P = 5; P <= 3000; P += 0.1) { const r = calc(ch, P, row, item); if (r.missing.length) return null; if (r.margem >= alvo) return Math.round(P * 10) / 10; }
    return null;
  }
  const situacao = (r) => !r || r.margem == null ? 'none' : r.margem < 0 ? 'bad' : r.margem < (+X.rules.alvo || 0) / 100 ? 'warn' : 'good';
  const CORES = { site: 'var(--pc-site)', ml: 'var(--pc-ml)', shopee: 'var(--pc-shopee)' };
  const cor = (ch) => CORES[ch.id] || 'var(--pc-outro)';

  // ---------- estoque e cobertura (previsão da aba Estoque) ----------
  function estoqueBase() {
    const res = window.EstoqueAba && window.EstoqueAba.carregado && window.EstoqueAba.carregado() ? window.EstoqueAba.resultado() : null;
    if (!res || !res.R) return null;
    const R = res.R, d30 = R.dias.slice(0, 30).reduce((a, d) => a + d.valor, 0) / 30;
    const porSku = new Map(), porNome = new Map();
    for (const i of R.itens) {
      for (const s of i.skus) porSku.set(plano(s), i);
      const k = 's:' + titleKey(i.produto); if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(i);
    }
    return { R, d30, porSku, porNome, ref: R.ref };
  }
  const ordTam = (t) => { if (/^\d+$/.test(t)) return [0, +t]; const L = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG']; const i = L.indexOf(t); return i >= 0 ? [1, i] : [2, 0]; };
  function estoqueDa(row, E) {
    const m = new Map();
    for (const i of E.porNome.get(row.key) || []) m.set(i.id, i);
    const skus = row.skus.concat(...Object.values(row.listings).map((ls) => ls.map((l) => l.sku)));
    for (const s of skus) { const i = E.porSku.get(plano(s)); if (i) m.set(i.id, i); }
    const its = [...m.values()];
    if (!its.length) return null;
    const est = its.reduce((a, i) => a + Math.max(0, i.estoque), 0);
    const dia = its.reduce((a, i) => a + i.share * E.d30, 0);
    const comVenda = its.filter((i) => i.share > 0);
    const zerados = comVenda.filter((i) => i.estoque <= 0);
    const menor = comVenda.filter((i) => i.estoque > 0 && i.cobertura_dias != null).sort((a, b) => a.cobertura_dias - b.cobertura_dias)[0] || null;
    const rk = (i) => i.ruptura === 'agora' ? '0000' : i.ruptura || '9999';
    const prim = comVenda.slice().sort((a, b) => rk(a).localeCompare(rk(b)))[0];
    const tams = its.slice().sort((a, b) => { const A = ordTam(a.tamanho), B = ordTam(b.tamanho); return A[0] - B[0] || A[1] - B[1] || String(a.variante).localeCompare(String(b.variante)); });
    return { its: tams, est, dia, cob: dia > 0 ? est / dia : null, zerados, menor, ruptura: prim ? prim.ruptura : null };
  }

  // ---------- modelo ----------
  function monta() {
    const products = produtosShopify();
    const chans = X.rules.channels || [];
    const idx = indice(products);
    const rows = new Map(products.map((p) => [p.key, { ...p, per: {}, listings: {} }]));
    for (const r of rows.values()) if (r.price != null) r.listings.site = [{ sku: r.skus[0] || '', p: r.price, t: r.title }];
    let pend = 0;
    for (const ch of chans) {
      const L = (X.listings || {})[ch.id]; if (!L || (ch.id === 'site' && products.length)) continue;
      for (const [sku, it] of Object.entries(L.items || {})) {
        const m = liga(ch.id, sku, it, products, idx);
        if (m.how === 'sem vínculo' || m.how === 'título') pend++;
        if (m.how === 'ignorado') continue;
        let key = m.key;
        if (!key) {
          key = 't:' + titleKey(it.t || sku);
          if (!rows.has(key)) rows.set(key, { key, title: cleanTitle(it.t) || sku, cat: catFromTitle(it.t || sku), price: null, shopifyCmv: null, w: it.w || null, skus: [sku], bases: new Set(), src: 'canal', per: {}, listings: {} });
        }
        const row = rows.get(key);
        const f = it.f == null && ch.kind === 'ml' ? freteML(sku) : null;
        (row.listings[ch.id] = row.listings[ch.id] || []).push({ sku, ...it, ...(f != null ? { f, fSrc: 'planilha' } : {}) });
        if (!row.w && it.w) row.w = it.w;
      }
    }
    const E = estoqueBase();
    const out = [];
    for (const row of rows.values()) {
      const man = (X.manual && X.manual.items || {})[row.key] || {};
      row.cmv = man.c != null ? man.c : row.shopifyCmv;
      row.cmvSrc = man.c != null ? 'manual' : row.shopifyCmv != null ? 'Shopify' : null;
      if (man.w) row.w = man.w;
      for (const ch of chans) {
        const ls = row.listings[ch.id]; if (!ls || !ls.length) continue;
        const pick = ls.reduce((a, b) => (b.p < a.p ? b : a));
        row.per[ch.id] = { ...calc(ch, pick.p, row, pick), item: pick, n: ls.length, priceVaries: new Set(ls.map((l) => l.p)).size > 1 };
      }
      if (!Object.keys(row.per).length) continue;
      const ms = Object.values(row.per).map((r) => r.margem).filter((v) => v != null);
      const ps = Object.values(row.per).map((r) => r.P);
      row.minM = ms.length ? Math.min(...ms) : null;
      row.spread = ps.length > 1 ? (Math.max(...ps) - Math.min(...ps)) / Math.min(...ps) : 0;
      row.E = E ? estoqueDa(row, E) : null;
      row.custoEst = row.E && row.cmv != null ? row.E.est * row.cmv : null;
      out.push(row);
    }
    M = { rows: out, pend, E };
  }

  // ---------- desenho ----------
  const fmtCob = (c) => c == null ? null : c > 365 ? '> 1 ano' : INT.format(c) + (Math.round(c) === 1 ? ' dia' : ' dias');
  const corCob = (c) => c == null ? '' : c < 15 ? 'bad' : c < 30 ? 'warn' : '';
  const zeradosTxt = (zs) => { const t = zs.filter((i) => i.tamanho !== 'Único').map((i) => i.tamanho).sort((a, b) => { const A = ordTam(a), B = ordTam(b); return A[0] - B[0] || A[1] - B[1]; }); if (t.length !== zs.length) return zs.map(tamTxt).join(', ') + (zs.length > 1 ? ' zerados' : ' zerado'); return 'tam ' + (t.length > 1 ? t.slice(0, -1).join(', ') + ' e ' + t[t.length - 1] + ' zerados' : t[0] + ' zerado'); };
  const tamTxt = (i) => i.tamanho !== 'Único' ? 'tam ' + i.tamanho : i.variante !== 'Default Title' ? i.variante : 'único';

  function janela() {
    const L = X.listings || {}, partes = [];
    for (const ch of X.rules.channels || []) if (ch.id !== 'site' && L[ch.id]) partes.push(`${ch.name} de ${quando(L[ch.id].importedAt)}`);
    if (X.shipML) partes.push(`frete do ML por SKU de ${quando(X.shipML.importedAt)}`);
    const est = M.E ? ` Estoque do fim de ${dataBR(M.E.ref)}/${M.E.ref.slice(0, 4)}, cobertura pela previsão da aba Estoque.` : ' Estoque: carregando a previsão da aba Estoque…';
    document.getElementById('pc-janela').textContent = `Preços do site e CMV lidos do Shopify em ${quando(X.gerado_em)}. Planilhas dos marketplaces: ${partes.join(' · ') || 'nenhuma importada'}.` + est;
  }
  function kpi(lab, val, sub, c) {
    return h('div', { class: 'pm-kpi' }, h('div', { class: 'pm-kpi-label' }, c ? h('span', { class: 'pc-dot', style: `background:${c}` }) : null, lab), h('div', { class: 'pm-kpi-value', text: val }), h('div', { class: 'pm-kpi-delta', text: sub }));
  }
  function filtrados() {
    const q = deacc(st.q.trim()), alvo = (+X.rules.alvo || 0) / 100;
    let list = M.rows.filter((r) => !q || deacc(r.title).includes(q) || r.skus.some((s) => deacc(s).includes(q)));
    if (st.c === 'mkt') list = list.filter((r) => r.per.ml || r.per.shopee); else if (st.c !== 'all') list = list.filter((r) => r.per[st.c]);
    if (st.cat !== 'all') list = list.filter((r) => (r.cat || 'Outros') === st.cat);
    const base = list;
    if (st.f === 'below') list = list.filter((r) => r.minM != null && r.minM < alvo);
    if (st.f === 'neg') list = list.filter((r) => r.minM != null && r.minM < 0);
    if (st.f === 'cob') list = list.filter((r) => r.E && r.E.dia > 0 && (r.E.cob <= 30 || r.E.zerados.length));
    if (st.f === 'parado') list = list.filter((r) => r.E && r.E.est > 0 && (r.E.cob == null || r.E.cob > 180));
    const cobK = (r) => !r.E ? 1e9 : r.E.zerados.length ? -1 : r.E.cob == null ? 1e8 : r.E.cob;
    if (st.sort === 'minm') list.sort((a, b) => (a.minM ?? 9) - (b.minM ?? 9));
    if (st.sort === 'cob') list.sort((a, b) => cobK(a) - cobK(b));
    if (st.sort === 'est') list.sort((a, b) => (b.custoEst || 0) - (a.custoEst || 0));
    if (st.sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    if (st.sort === 'spread') list.sort((a, b) => b.spread - a.spread);
    return { list, base };
  }
  function cards(base) {
    const box = document.getElementById('pc-cards'); box.replaceChildren();
    const comE = base.filter((r) => r.E);
    const un = comE.reduce((a, r) => a + r.E.est, 0), custo = comE.reduce((a, r) => a + (r.custoEst || 0), 0);
    const dia = comE.reduce((a, r) => a + r.E.dia, 0);
    box.append(kpi('Produtos exibidos', INT.format(base.length), `${base.filter((r) => Object.keys(r.per).length > 1).length} vendidos em 2+ canais`));
    box.append(kpi('Estoque a custo', fmtR0(custo), `${INT.format(un)} peças · cobertura média ${fmtCob(dia > 0 ? un / dia : null) || '—'}`));
    for (const ch of X.rules.channels || []) {
      const rs = base.map((r) => r.per[ch.id]).filter(Boolean).filter((r) => r.margem != null && !r.missing.includes('CMV'));
      const neg = rs.filter((r) => r.margem < 0).length;
      const avg = rs.length ? rs.reduce((a, r) => a + r.margem, 0) / rs.length : null;
      const br = rs.filter((r) => r.bruta != null), bAvg = br.length ? br.reduce((a, r) => a + r.bruta, 0) / br.length : null;
      box.append(kpi(ch.name, fmtP(avg), rs.length ? `margem líquida média · bruta ${fmtP(bAvg)} · ${rs.length} produtos${neg ? ` · ${neg} no prejuízo` : ''}` : 'sem preços', cor(ch)));
    }
  }
  function celEstoque(r) {
    if (!r.E) return [h('td', { class: 'pc-est muted', text: M.E ? '—' : '…' }), h('td', { class: 'pc-cob muted', text: '' })];
    const E = r.E;
    const tdE = h('td', { class: 'pc-est' }, h('span', { class: 'pc-v', text: INT.format(E.est) }), h('span', { class: 'pc-sub', text: r.custoEst != null ? fmtR0(r.custoEst) + ' a custo' : 'peças' }));
    let principal, cls = '', sub = null, subCls = '';
    if (E.est <= 0) { principal = E.dia > 0 ? 'sem estoque' : '—'; cls = E.dia > 0 ? 'bad' : 'muted'; }
    else if (E.dia <= 0) { principal = 'sem venda'; cls = 'muted'; sub = 'nenhuma venda prevista'; }
    else { principal = fmtCob(E.cob); cls = corCob(E.cob); if (E.ruptura && E.ruptura !== 'agora') sub = 'acaba ' + dataBR(E.ruptura) + ' (' + tamTxt(E.its.find((i) => i.ruptura === E.ruptura) || E.its[0]) + ')'; }
    if (E.zerados.length && E.est > 0) { sub = zeradosTxt(E.zerados); subCls = 'bad'; }
    else if (E.menor && E.cob != null && E.menor.cobertura_dias < 30 && E.menor.cobertura_dias < E.cob * 0.6) { sub = tamTxt(E.menor) + ': ' + fmtCob(E.menor.cobertura_dias); subCls = corCob(E.menor.cobertura_dias) || 'warn'; }
    const tdC = h('td', { class: 'pc-cob' }, h('span', { class: 'pc-v ' + cls, text: principal }), sub ? h('span', { class: 'pc-sub ' + subCls, text: sub }) : null);
    return [tdE, tdC];
  }
  function celPreco(r) {
    if (!r) return h('td', { class: 'muted', text: '—' });
    const s = situacao(r), soFrete = r.missing.length && !r.missing.includes('CMV');
    return h('td', { class: 'pc-cel' },
      h('span', { class: 'pc-v', text: fmtR(r.P) }), r.priceVaries ? h('span', { class: 'pc-tag', title: 'Anúncios deste produto com preços diferentes; mostrando o menor', text: 'varia' }) : null,
      h('span', { class: 'pc-sub' }, r.missing.includes('CMV') ? h('span', { class: 'pc-tag', text: 'sem CMV' }) : [h('span', { class: 'pc-pill ' + s, text: (soFrete ? '~' : '') + fmtP(r.margem) }), ' ', fmtR(r.lucro)], soFrete ? h('span', { class: 'pc-tag', text: r.missing[0] + '?' }) : null),
      r.bruta != null ? h('span', { class: 'pc-sub', text: 'bruta ' + fmtP(r.bruta) }) : null);
  }
  function detalhe(r, ncol) {
    const chans = (X.rules.channels || []).filter((ch) => r.per[ch.id]);
    const L = [['Preço de venda', (x) => x.P], ['Desconto médio', (x) => -x.desconto], ['Comissão', (x) => -x.com], ['Taxa fixa', (x) => -x.fixo], ['Frete (vendedor)', (x) => -x.frete], ['Gateway / pagamento', (x) => -x.gateway], ['Imposto', (x) => -x.imposto], ['Mídia / Ads', (x) => -x.ads], ['CMV', (x) => x.cmv == null ? null : -x.cmv]];
    const mp = {}; for (const ch of chans) mp[ch.id] = precoMinimo(ch, r, r.per[ch.id].item);
    const conta = h('table', { class: 'pc-mini' },
      h('thead', {}, h('tr', {}, h('th', { text: '' }), chans.map((ch) => h('th', {}, h('span', { class: 'pc-dot', style: `background:${cor(ch)}` }), ch.name)))),
      h('tbody', {},
        L.map(([lab, fn]) => h('tr', {}, h('td', { text: lab }), chans.map((ch) => { const v = fn(r.per[ch.id]); return h('td', { text: v == null ? '—' : fmtR(v === 0 ? 0 : v) }); }))),
        h('tr', { class: 'pc-tot' }, h('td', { text: 'Lucro por unidade' }), chans.map((ch) => h('td', { text: fmtR(r.per[ch.id].lucro) }))),
        h('tr', {}, h('td', { text: 'Margem líquida' }), chans.map((ch) => h('td', {}, h('span', { class: 'pc-pill ' + situacao(r.per[ch.id]), text: fmtP(r.per[ch.id].margem) })))),
        h('tr', {}, h('td', { text: 'Margem bruta (preço − CMV)' }), chans.map((ch) => h('td', { text: fmtP(r.per[ch.id].bruta) }))),
        h('tr', {}, h('td', { text: `Preço mínimo p/ ${X.rules.alvo}%` }), chans.map((ch) => h('td', { text: mp[ch.id] == null ? '—' : fmtR(mp[ch.id]) }))),
        h('tr', {}, h('td', { class: 'muted', text: 'Observações' }), chans.map((ch) => { const x = r.per[ch.id]; return h('td', { class: 'muted', style: 'white-space:normal', text: [...x.notes, x.item && x.item.fSrc ? 'frete da planilha' : null, x.n > 1 ? `${x.n} anúncios` : null, ...x.missing.map((m) => 'falta ' + m)].filter(Boolean).join(' · ') }); }))));
    const blocoConta = h('div', {}, h('h3', { text: 'Conta da margem por canal' }), conta,
      h('p', { class: 'pm-note', style: 'margin-top:6px', text: `CMV ${fmtR(r.cmv)}${r.cmvSrc ? ' (' + r.cmvSrc + ')' : ''} · peso ${r.w == null ? '—' : r.w.toLocaleString('pt-BR') + ' kg'}` + (r.src === 'shopify' ? ` · ${r.variants} ${r.variants === 1 ? "variação" : "variações"} no site, preço com 6 canetinhas` : ' · produto só no marketplace') + ((X.rules.channels || []).filter((ch) => ch.id !== 'site' && r.listings[ch.id]).map((ch) => ` · ${ch.name}: ${r.listings[ch.id].map((l) => l.sku).join(', ')}`).join('')) }));
    let blocoEst;
    if (!r.E) blocoEst = h('div', {}, h('h3', { text: 'Estoque por tamanho' }), h('p', { class: 'pm-note', text: M.E ? 'Produto sem estoque cadastrado no Shopify.' : 'Carregando a previsão da aba Estoque…' }));
    else {
      const E = r.E, d30 = M.E.d30;
      const tb = h('tbody', {}, E.its.map((i) => {
        const dia = i.share * d30;
        const rup = i.estoque <= 0 && i.share > 0 ? 'sem estoque' : i.ruptura ? dataBR(i.ruptura) : dia > 0 ? '—' : 'sem venda';
        return h('tr', {}, h('td', { text: tamTxt(i) }), h('td', { text: INT.format(Math.max(0, i.estoque)) }), h('td', { text: dia > 0 ? dia.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '0' }),
          h('td', { class: corCob(i.cobertura_dias), text: i.estoque <= 0 ? '—' : fmtCob(i.cobertura_dias) || 'sem venda' }), h('td', { class: i.estoque <= 0 && i.share > 0 ? 'bad' : '', text: rup }));
      }), h('tr', { class: 'pc-tot' }, h('td', { text: 'Produto' }), h('td', { text: INT.format(E.est) }), h('td', { text: E.dia.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }), h('td', { text: E.est <= 0 ? '—' : fmtCob(E.cob) || 'sem venda' }), h('td', { text: E.ruptura === 'agora' ? 'já falta tamanho' : E.ruptura ? dataBR(E.ruptura) : '—' })));
      blocoEst = h('div', {}, h('h3', { text: 'Estoque e cobertura por tamanho' }),
        h('table', { class: 'pc-mini' }, h('thead', {}, h('tr', {}, ['Tamanho', 'Estoque', 'Venda/dia prevista', 'Cobertura', 'Acaba em'].map((t) => h('th', { text: t })))), tb),
        h('p', { class: 'pm-note', style: 'margin-top:6px', text: 'Kits com 6 e 12 canetinhas usam a mesma peça: o estoque aparece uma vez por tamanho. Na linha do produto, "acaba em" é o primeiro tamanho a acabar.' }));
    }
    return h('tr', { class: 'pc-det' }, h('td', { colspan: String(ncol) }, h('div', { class: 'pc-det-grid' }, blocoEst, blocoConta)));
  }
  function tabela(list) {
    const chans = X.rules.channels || [], ncol = 4 + chans.length;
    const th = (t, cls, c) => h('th', { class: cls || '' }, h('button', { type: 'button', tabindex: '-1' }, c ? h('span', { class: 'pc-dot', style: `background:${c}` }) : null, t));
    document.querySelector('#pc-tabela thead').replaceChildren(h('tr', {}, th('Produto', 'pm-txt'), th('CMV'), th('Estoque'), th('Cobertura'), chans.map((ch) => th(ch.name, '', cor(ch)))));
    const tb = document.querySelector('#pc-tabela tbody'); tb.replaceChildren();
    if (!list.length) { tb.append(h('tr', {}, h('td', { colspan: String(ncol), class: 'pm-txt muted', text: M.rows.length ? 'Nenhum produto com esse filtro.' : 'Nenhum preço carregado.' }))); return; }
    for (const r of list) {
      const aberto = st.abertos.has(r.key);
      tb.append(h('tr', { class: 'pm-abre', tabindex: '0', 'aria-expanded': String(aberto), onclick: () => { aberto ? st.abertos.delete(r.key) : st.abertos.add(r.key); desenha(); }, onkeydown: (e) => { if (e.key === 'Enter') { aberto ? st.abertos.delete(r.key) : st.abertos.add(r.key); desenha(); } } },
        h('td', { class: 'pm-txt' }, h('span', { class: 'pm-seta', text: aberto ? '▾' : '▸' }), h('b', { text: r.title }), h('span', { class: 'pc-sub', text: `${r.cat || 'Outros'} · ` + (r.src === 'shopify' ? `${r.variants} ${r.variants === 1 ? "variação" : "variações"} no site` : 'só no marketplace') })),
        h('td', {}, r.cmv == null ? h('span', { class: 'pc-tag', text: 'sem CMV' }) : [h('span', { text: fmtR(r.cmv) }), h('span', { class: 'pc-sub', text: r.cmvSrc })]),
        celEstoque(r), chans.map((ch) => celPreco(r.per[ch.id]))));
      if (aberto) tb.append(detalhe(r, ncol));
    }
  }
  function categorias() {
    const sel = document.getElementById('pc-cat'), cats = [...new Set(M.rows.map((r) => r.cat || 'Outros'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const want = cats.join('|'); if (sel.dataset.opts === want) return;
    sel.replaceChildren(h('option', { value: 'all', text: 'Todas as categorias' }), ...cats.map((c) => h('option', { value: c, text: `${c} (${M.rows.filter((r) => (r.cat || 'Outros') === c).length})` })));
    sel.dataset.opts = want; if (st.cat !== 'all' && !cats.includes(st.cat)) st.cat = 'all'; sel.value = st.cat;
  }
  const marca = (id, attr, v) => document.querySelectorAll('#' + id + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === v)));
  function desenha() {
    const a = aba(); if (!a || a.hidden) return;
    if (!X) { document.getElementById('pc-janela').textContent = 'Carregando os preços…'; return; }
    monta(); categorias(); janela();
    marca('pc-seg-filtro', 'f', st.f); marca('pc-seg-canal', 'c', st.c);
    const { list, base } = filtrados();
    cards(base); tabela(list);
    document.getElementById('pc-nota').textContent = `Uma linha por produto. Estoque = peças no fim do dia, todos os tamanhos juntos; cobertura = estoque ÷ venda diária prevista do produto (média dos próximos 30 dias, pela previsão da aba Estoque). Embaixo da cobertura aparece o tamanho que acaba primeiro ou que já zerou. Clique numa linha para ver os tamanhos e a conta da margem.${M.pend ? ` ${M.pend} anúncios dos marketplaces estão ligados pelo título ou sem produto do site: confira na aba Conciliação do Controle de Precificação.` : ''}`;
    document.getElementById('pc-rodape').replaceChildren(h('b', { text: 'Como ler. ' }), `Preço = versão de entrada (6 canetinhas), igual para todos os tamanhos, com um único CMV para todos os canais. Margem líquida (etiqueta colorida) = (preço − desconto − comissão − taxa fixa − frete − gateway − imposto − mídia − CMV) ÷ preço recebido; verde no alvo de ${X.rules.alvo}% ou acima, laranja abaixo do alvo, vermelho no prejuízo. Margem bruta = (preço − CMV) ÷ preço. As regras, as planilhas do Mercado Livre e da Shopee e a conciliação dos anúncios são as do Controle de Precificação: mude lá, e esta aba atualiza na manhã seguinte. A cobertura usa a venda do site, como a aba Estoque: se o mesmo estoque também vende no Mercado Livre e na Shopee, ele acaba antes do que aparece aqui. Cobertura em vermelho abaixo de 15 dias e em laranja abaixo de 30.`);
  }

  // ---------- eventos ----------
  document.getElementById('pc-busca').addEventListener('input', (e) => { st.q = e.target.value; desenha(); });
  document.getElementById('pc-seg-filtro').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.f = b.dataset.f; desenha(); } });
  document.getElementById('pc-seg-canal').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.c = b.dataset.c; desenha(); } });
  document.getElementById('pc-cat').addEventListener('change', (e) => { st.cat = e.target.value; desenha(); });
  document.getElementById('pc-ordem').addEventListener('change', (e) => { st.sort = e.target.value; desenha(); });
  document.getElementById('abas').addEventListener('click', () => setTimeout(() => { carregaDoPainel(); desenha(); }, 0));

  // Painel do Claude: os dados vêm do arquivo "precificacao" (uma linha com o campo j = JSON de tudo).
  let chave = null;
  function carregaDoPainel() {
    if (!window.dash || typeof dash.data !== 'function' || (X && X._estatico)) return;
    const d = dash.data('precificacao');
    if (!d || d.status !== 'ok') { if (d && d.status === 'error' && aba() && !aba().hidden) document.getElementById('pc-janela').textContent = 'Não foi possível carregar os preços. Tente atualizar a página.'; return; }
    const linhas = Array.isArray(d.data) ? d.data : (d.data && d.data.rows) || [];
    const txt = linhas.map((r) => (r && typeof r.j === 'string' ? r.j : '')).join('');
    if (!txt || txt === chave) return;
    try { X = JSON.parse(txt); chave = txt; } catch (e) { return; }
  }
  if (window.dash && typeof dash.onData === 'function') { try { dash.onData(() => { carregaDoPainel(); setTimeout(desenha, 0); }); } catch (e) { /* sem onData */ } }

  window.PrecosAba = { define(x) { if (!x) return; X = { ...x, _estatico: true }; desenha(); }, desenha };
})();
