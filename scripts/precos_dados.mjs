// Dados da aba Precificação: produtos do Shopify (preço, custo e peso de cada variação) + o que está salvo no
// Controle de Precificação (regras dos canais, planilhas do ML e da Shopee, frete do ML por SKU, vínculos e CMV manual).
//
// Uso:
//   node scripts/precos_dados.mjs --consulta
//       imprime a consulta GraphQL (ferramenta graphql_query do Shopify, first 50, paginando com after)
//   node scripts/precos_dados.mjs --artefato <precos.json> <saída.json>   (arquivo do dataset "precificacao" do painel do Claude)
//   node scripts/precos_dados.mjs <pasta-das-paginas> <pasta-do-banco> <saída.json>
//       <pasta-das-paginas>: as respostas do graphql_query (uma por arquivo .json/.txt, {data:{products:{nodes}}})
//       <pasta-do-banco>: "-" para gravar só os produtos ativos; ou a leitura do banco do Controle de Precificação com out_dir (subpastas config/, listings/,
//                         costs/, shipping/, links/, sales/ com um .json por documento)
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const CONSULTA = 'query P($first:Int!, $after:String){ products(first:$first, after:$after, query:"status:active"){ pageInfo{hasNextPage endCursor} nodes{ title productType variants(first:100){ nodes{ sku title price inventoryItem{ unitCost{ amount } measurement{ weight{ value unit } } } } } } } }';

if (process.argv[2] === '--consulta') { console.log(CONSULTA); process.exit(0); }
// --artefato <precos.json> <saída>: o mesmo conteúdo no formato do arquivo do painel do Claude (uma linha {j: JSON})
if (process.argv[2] === '--artefato') { const t = readFileSync(process.argv[3], 'utf8'); JSON.parse(t); writeFileSync(process.argv[4], JSON.stringify([{ j: t }])); console.log('ok'); process.exit(0); }
const [, , pastaPag, pastaDb, saida] = process.argv;
if (!pastaPag || !pastaDb || !saida) { console.error('Uso: node scripts/precos_dados.mjs <pasta-das-paginas> <pasta-do-banco> <saída.json>'); process.exit(1); }

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const kg = (w) => { if (!w || w.value == null) return null; const v = +w.value; const u = String(w.unit).toUpperCase(); const k = u === 'GRAMS' ? v / 1000 : u === 'POUNDS' ? v * 0.4536 : u === 'OUNCES' ? v * 0.02835 : v; return k > 0 ? Math.round(k * 1000) / 1000 : null; };
function acha(o, d = 0) {
  if (!o || typeof o !== 'object' || d > 8) return null;
  if (o.products && Array.isArray(o.products.nodes)) return o.products;
  for (const v of Object.values(o)) { let x = v; if (typeof v === 'string' && v.trim().startsWith('{')) { try { x = JSON.parse(v); } catch { x = null; } } const r = acha(x, d + 1); if (r) return r; }
  return null;
}

// 1. produtos do Shopify
const vistos = new Set(), produtos = [];
const arqs = readdirSync(pastaPag).filter((f) => /\.(json|txt)$/i.test(f)).sort();
if (!arqs.length) throw new Error('Nenhuma página do Shopify em ' + pastaPag);
for (const f of arqs) {
  const bruto = readFileSync(path.join(pastaPag, f), 'utf8');
  let j; try { j = JSON.parse(bruto); } catch { throw new Error(f + ' não é JSON'); }
  const conn = acha(j); if (!conn) throw new Error(f + ' não tem products.nodes');
  for (const n of conn.nodes) {
    const t = String(n.title || '').replace(/\s+/g, ' ').trim();
    const v = (n.variants?.nodes || []).map((x) => [String(x.sku || '').trim().toUpperCase(), x.title || '', num(x.price), num(x.inventoryItem?.unitCost?.amount), kg(x.inventoryItem?.measurement?.weight)]);
    const k = t + '|' + v.map((x) => x[0]).join(',');
    if (vistos.has(k)) continue; vistos.add(k);
    produtos.push({ t, ty: String(n.productType || '').trim(), v });
  }
}

// 2. banco do Controle de Precificação
const doc = (col, id) => { const p = path.join(pastaDb, col, id + '.json'); if (!existsSync(p)) return null; const d = JSON.parse(readFileSync(p, 'utf8')); return d && d.data && !d.items && !d.rules ? d.data : d; };
const col = (c) => { const p = path.join(pastaDb, c); if (!existsSync(p) || !statSync(p).isDirectory()) return {}; return Object.fromEntries(readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), doc(c, f.slice(0, -5))])); };
// "-" no lugar da pasta do banco: só a lista de produtos ativos (usada pelo e-mail de ruptura)
if (pastaDb === '-') { writeFileSync(saida, JSON.stringify({ gerado_em: new Date().toISOString(), produtos })); console.log(`ok: ${produtos.length} produtos ativos`); process.exit(0); }
const rules = doc('config', 'rules');
if (!rules || !rules.rules) throw new Error('config/rules não encontrado em ' + pastaDb);
const enxuga = (L) => L && { items: L.items || {}, importedAt: L.importedAt || null, fileName: L.fileName || null };
const listings = Object.fromEntries(Object.entries(col('listings')).map(([k, v]) => [k, enxuga(v)]));
const sales = Object.fromEntries(Object.entries(col('sales')).map(([k, v]) => [k, enxuga(v)]));
const manual = doc('costs', 'manual'), links = doc('links', 'map'), ship = doc('shipping', 'ml');

const X = {
  gerado_em: new Date().toISOString(),
  rules: rules.rules, regras_em: rules.updatedAt || null,
  listings, sales,
  manual: { items: (manual && manual.items) || {} },
  links: (links && links.items) || {},
  shipML: ship ? enxuga(ship) : null,
  produtos,
};
writeFileSync(saida, JSON.stringify(X));
console.log(`ok: ${produtos.length} produtos do Shopify, ${Object.keys(listings).length} planilhas de canal, ${Object.keys(X.links).length} vínculos manuais, ${Object.keys(X.manual.items).length} CMVs manuais`);
