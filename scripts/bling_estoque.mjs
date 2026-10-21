// Estoque físico pelo Bling (as vendas continuam vindo do Shopify).
//
// Cada variante ativa do Shopify é ligada a um código do Bling:
//   - kits (SKU começando com K): a peça de roupa do kit. Tira o K, os espaços e a quantidade de canetinhas do fim
//     ("K CA VC 04 12" -> CAVC04, "KCADDIAGG06" -> CADDIAGG). As exceções ficam em src/bling_pecas.json
//     (null = o kit no Bling não tem peça de roupa cadastrada: estoque 0).
//   - os demais SKUs: o próprio código (canetinhas, meias, tênis...).
// O estoque da variante = saldo do Bling desse código (negativo vira 0). As variantes de 6 e 12 canetinhas
// do mesmo tamanho apontam para a mesma peça, e a previsão já conta cada peça uma vez.
//
// Uso:
//   node scripts/bling_estoque.mjs --lotes <precos.json>
//       imprime um JSON com os lotes de códigos: [[...], [...]]. Cada lote vai numa chamada listProducts do Bling
//       com codigos = o lote, fields ["codigo","estoque","situacao"] e limite 100.
//   node scripts/bling_estoque.mjs <pasta-das-respostas> <precos.json> <saída.json>
//       <pasta-das-respostas>: as respostas do listProducts (uma por arquivo .json/.txt, {data:[{codigo, estoque:{saldoVirtualTotal}}]})
//       Recusa (sai com erro) se faltar CAN06 ou se menos de 60% dos códigos voltarem: aí o painel segue com o estoque do Shopify.
//   node scripts/bling_estoque.mjs --artefato <estoque_bling.json> <saída.json>   (arquivo do dataset "estoque_bling" do painel do Claude)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pl = (s) => String(s ?? '').replace(/[\s\-_./]/g, '').toUpperCase();
const EXC = Object.fromEntries(Object.entries(JSON.parse(readFileSync(path.join(root, 'src', 'bling_pecas.json'), 'utf8')).kits).map(([k, v]) => [pl(k), v]));
const LOTE = 50;

// códigos do Bling de uma variante do Shopify: lista de [código para buscar]; null = sem peça no Bling
export function codigosDe(sku) {
  const x = pl(sku);
  if (!x) return [];
  if (x in EXC) return EXC[x];
  if (!x.startsWith('K')) return [String(sku).trim().replace(/\s+/g, ' ')];
  const y = x.slice(1);
  for (const re of [/(\d{2})(06|6|12)$/, /(PP|P|M|G|GG|XG)(06|6|12)$/]) { const m = y.match(re); if (m) return [y.slice(0, m.index) + m[1]]; }
  return [y];
}

const produtosDe = (arq) => JSON.parse(readFileSync(arq, 'utf8')).produtos || [];

function lotes(arqPrecos) {
  const cod = new Set(['CAN06', 'CAN12']);
  for (const p of produtosDe(arqPrecos)) for (const v of p.v) for (const c of codigosDe(v[0]) || []) cod.add(c);
  const L = [...cod].sort(); const out = [];
  for (let i = 0; i < L.length; i += LOTE) out.push(L.slice(i, i + LOTE));
  return out;
}
if (process.argv[2] === '--lotes') { console.log(JSON.stringify(lotes(process.argv[3]))); process.exit(0); }
if (process.argv[2] === '--artefato') { const t = readFileSync(process.argv[3], 'utf8'); JSON.parse(t); writeFileSync(process.argv[4], JSON.stringify([{ j: t }])); console.log('ok'); process.exit(0); }

const [, , pasta, precos, saida] = process.argv;
if (!pasta || !precos || !saida) { console.error('Uso: node scripts/bling_estoque.mjs <pasta-das-respostas> <precos.json> <saída.json>'); process.exit(1); }

// 1. saldos do Bling (procura em qualquer nível objetos com codigo + estoque.saldoVirtualTotal)
const saldo = new Map();
function junta(o, d = 0) {
  if (!o || d > 8) return;
  if (typeof o === 'string') {
    // a resposta do conector pode vir com notas depois do JSON ("---\nNota: ..."): corta antes de ler
    const t = o.trim().split(/\n---\s*\n/)[0].trim();
    if (t.startsWith('{') || t.startsWith('[')) { try { junta(JSON.parse(t), d + 1); } catch { /* texto */ } }
    return;
  }
  if (Array.isArray(o)) { for (const x of o) junta(x, d + 1); return; }
  if (typeof o !== 'object') return;
  if ('codigo' in o && o.estoque && typeof o.estoque === 'object' && o.estoque.saldoVirtualTotal != null) {
    const k = pl(o.codigo); if (k) saldo.set(k, Math.max(saldo.has(k) ? saldo.get(k) : -Infinity, Number(o.estoque.saldoVirtualTotal) || 0));
    return;
  }
  for (const v of Object.values(o)) junta(v, d + 1);
}
const arqs = readdirSync(pasta).filter((f) => /\.(json|txt)$/i.test(f)).sort();
if (!arqs.length) throw new Error('Nenhuma resposta do Bling em ' + pasta);
for (const f of arqs) junta(readFileSync(path.join(pasta, f), 'utf8'));

// 2. estoque por variante ativa do Shopify
const pedidos = new Set(), itens = [], semPar = [], semPeca = [];
for (const p of produtosDe(precos)) {
  for (const [sku, vt] of p.v) {
    if (!sku) continue;
    const cods = codigosDe(sku);
    let q = 0, fonte = 'bling';
    if (cods === null) fonte = 'kit sem peça no Bling';
    else {
      cods.forEach((c) => pedidos.add(pl(c)));
      const vals = cods.map((c) => saldo.get(pl(c)));
      if (vals.some((v) => v == null)) { fonte = /^K/.test(pl(sku)) ? 'peça não ativa no Bling' : 'sem cadastro no Bling'; }
      else q = Math.max(0, Math.min(...vals));
    }
    if (fonte === 'sem cadastro no Bling') { semPar.push(sku); continue; } // fica o estoque do Shopify
    itens.push([p.t, vt, sku, q]);
    if (fonte !== 'bling') semPeca.push(sku); // kit cuja peça não existe (ou não está ativa) no Bling: estoque 0
  }
}
const achados = [...pedidos].filter((c) => saldo.has(c)).length;
if (!saldo.has('CAN06')) throw new Error('A resposta do Bling não trouxe CAN06: confira se todos os lotes foram salvos.');
if (achados < pedidos.size * 0.6) throw new Error(`Só ${achados} de ${pedidos.size} códigos voltaram do Bling: confira se todos os lotes foram salvos.`);
const vazios = lotes(precos).map((l, i) => (l.some((c) => saldo.has(pl(c))) ? null : i + 1)).filter(Boolean);
if (vazios.length) throw new Error(`Nenhum código do lote ${vazios.join(', ')} voltou do Bling: confira se a resposta desse lote foi salva.`);
writeFileSync(saida, JSON.stringify({ gerado_em: new Date().toISOString(), fonte: 'Bling', campos: ['product_title', 'product_variant_title', 'product_variant_sku', 'ending_inventory_units'], itens, sem_par: semPar, sem_peca: semPeca }));
console.log(`ok: ${itens.length} variantes com estoque do Bling (${achados} de ${pedidos.size} códigos encontrados; ${semPeca.length} kits sem a peça no Bling ficam com 0); ${semPar.length} SKUs sem cadastro no Bling ficam com o estoque do Shopify`);
