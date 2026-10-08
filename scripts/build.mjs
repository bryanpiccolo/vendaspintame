// Coleta os números do Shopify (venda fechada até ontem) e gera dist/index.html
// com os dados embutidos. A criptografia com senha é feita depois, no workflow.
//
// Variáveis de ambiente:
//   SHOPIFY_STORE          ex.: pintamemais.myshopify.com
//   SHOPIFY_TOKEN          token de acesso do app (shpat_...)            — ou —
//   SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET (app do Dev Dashboard)
//   FIXTURES_DIR           (opcional, para teste) lê respostas salvas em vez de chamar a API
//   REF_DATE               (opcional, para teste) data de referência AAAA-MM-DD; padrão = ontem em Brasília

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const API_VERSION = '2026-10';
const TZ = 'America/Sao_Paulo';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ref = process.env.REF_DATE || addDias(hojeSP(), -1);          // último dia fechado
const anoRef = +ref.slice(0, 4);
const refAnoPassado = ref.slice(5) === '02-29' ? `${anoRef - 1}-02-28` : (anoRef - 1) + ref.slice(4); // mesmo dia, um ano antes

const M_VENDAS = 'orders, net_items_sold, gross_sales, discounts, sales_reversals, net_sales, shipping_charges, cost_of_goods_sold, gross_profit';
const M_PROD = 'net_items_sold, gross_sales, discounts, sales_reversals, net_sales, shipping_charges, cost_of_goods_sold, gross_profit';
const M_EST = 'starting_inventory_units, ending_inventory_units, inventory_units_sold';
const DIM = 'product_type, product_title, product_variant_title';
const fim = (y) => (y === anoRef ? ref : `${y}-12-31`);

export function consultas() {
  const q = {
    mensal: `FROM sales SHOW ${M_VENDAS} TIMESERIES month SINCE 2022-01-01 UNTIL ${ref}`,
    ano_passado: `FROM sales SHOW ${M_VENDAS} TIMESERIES month SINCE ${anoRef - 1}-01-01 UNTIL ${refAnoPassado}`,
    ontem: `FROM sales SHOW ${M_VENDAS} SINCE ${ref} UNTIL ${ref}`,
    produtos_ontem: `FROM sales SHOW ${M_PROD} GROUP BY ${DIM} SINCE ${ref} UNTIL ${ref} ORDER BY net_sales DESC LIMIT 10000`,
    estoque_ontem: `FROM inventory SHOW ${M_EST} GROUP BY ${DIM} SINCE ${ref} UNTIL ${ref} ORDER BY inventory_units_sold DESC LIMIT 10000`,
    estados: `FROM sales SHOW ${M_VENDAS} GROUP BY month, shipping_region SINCE 2022-01-01 UNTIL ${ref} ORDER BY month ASC LIMIT 20000`,
    estados_ly: `FROM sales SHOW ${M_VENDAS} GROUP BY month, shipping_region SINCE ${anoRef - 1}-01-01 UNTIL ${refAnoPassado} ORDER BY month ASC LIMIT 20000`,
  };
  for (let y = 2022; y <= anoRef; y++) q[`produtos_${y}`] = `FROM sales SHOW ${M_PROD} GROUP BY month, ${DIM} SINCE ${y}-01-01 UNTIL ${fim(y)} ORDER BY month ASC LIMIT 20000`;
  for (let y = 2023; y <= anoRef; y++) q[`estoque_${y}`] = `FROM inventory SHOW ${M_EST} GROUP BY month, ${DIM} SINCE ${y}-01-01 UNTIL ${fim(y)} ORDER BY month ASC LIMIT 20000`;
  return q;
}

async function token() {
  if (process.env.SHOPIFY_TOKEN) return process.env.SHOPIFY_TOKEN;
  const { SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET } = process.env;
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) throw new Error('Falta SHOPIFY_TOKEN ou SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET nos segredos do repositório.');
  const r = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: SHOPIFY_CLIENT_ID, client_secret: SHOPIFY_CLIENT_SECRET }),
  });
  if (!r.ok) throw new Error(`Shopify recusou o login do app (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).access_token;
}

// Normaliza qualquer resposta para { columns: [{name,dataType}], rows: [ {col: valor} ] }
export function normaliza(t, nome) {
  if (!t || !Array.isArray(t.columns)) throw new Error(`Consulta ${nome} sem tabela`);
  const cols = t.columns.map((c) => ({ name: c.name, dataType: c.dataType }));
  const rows = (t.rows || []).map((r) => (Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [c.name, r[i]])) : r));
  const num = new Set(cols.filter((c) => /MONEY|INTEGER|NUMBER|PERCENT|FLOAT|DECIMAL/.test(c.dataType)).map((c) => c.name));
  return rows.map((r) => Object.fromEntries(cols.map((c) => {
    const v = r[c.name];
    return [c.name, num.has(c.name) ? (v === '' || v == null ? null : Number(v)) : (v ?? '')];
  })));
}

async function roda(nome, consulta, tk) {
  if (process.env.FIXTURES_DIR) {
    const f = path.join(process.env.FIXTURES_DIR, nome + '.json');
    if (!existsSync(f)) throw new Error(`Falta o arquivo de teste ${f}`);
    return normaliza(JSON.parse(await readFile(f, 'utf8')), nome);
  }
  const body = JSON.stringify({ query: 'query($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name dataType } rows } parseErrors } }', variables: { q: consulta } });
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': tk }, body });
    if ((r.status === 429 || r.status >= 500) && tentativa < 4) { await new Promise((s) => setTimeout(s, 3000 * tentativa)); continue; }
    if (!r.ok) throw new Error(`Shopify respondeu ${r.status} na consulta ${nome}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const limitado = j.errors && JSON.stringify(j.errors).includes('THROTTLED');
    if (limitado && tentativa < 6) { await new Promise((s) => setTimeout(s, 5000 * tentativa)); continue; }
    if (j.errors) throw new Error(`Erro na consulta ${nome}: ${JSON.stringify(j.errors).slice(0, 300)}`);
    const res = j.data && j.data.shopifyqlQuery;
    if (res && res.parseErrors && res.parseErrors.length) throw new Error(`ShopifyQL não entendeu a consulta ${nome}: ${res.parseErrors.join('; ')}`);
    return normaliza(res && res.tableData, nome);
  }
}

// Compacta linhas por produto/variante em listas com dicionário de textos, para a página ficar leve.
function compacta(rows, campos) {
  const dic = [], idx = new Map();
  const id = (s) => { s = String(s ?? ''); if (!idx.has(s)) { idx.set(s, dic.length); dic.push(s); } return idx.get(s); };
  const texto = new Set(['month', 'product_type', 'product_title', 'product_variant_title']);
  const linhas = rows
    .filter((r) => campos.some((c) => !texto.has(c) && r[c]))
    .map((r) => campos.map((c) => (c === 'month' ? String(r[c]).slice(0, 7) : texto.has(c) ? id(r[c]) : r[c])));
  return { campos, dic, linhas };
}

async function main() {
  const q = consultas();
  const tk = process.env.FIXTURES_DIR ? null : await token();
  const R = {};
  for (const [nome, consulta] of Object.entries(q)) {
    R[nome] = await roda(nome, consulta, tk);
    console.log(`${nome}: ${R[nome].length} linhas`);
    if (R[nome].length >= 20000) throw new Error(`Consulta ${nome} chegou ao limite de linhas; divida o período.`);
  }
  const P = ['month', 'product_type', 'product_title', 'product_variant_title', 'net_items_sold', 'gross_sales', 'discounts', 'sales_reversals', 'net_sales', 'shipping_charges', 'cost_of_goods_sold', 'gross_profit'];
  const E = ['month', 'product_type', 'product_title', 'product_variant_title', 'starting_inventory_units', 'ending_inventory_units', 'inventory_units_sold'];
  const anos = (pref) => Object.keys(R).filter((k) => k.startsWith(pref) && /\d{4}$/.test(k)).flatMap((k) => R[k]);
  const dados = {
    gerado_em: new Date().toISOString(),
    referencia: ref,
    mensal: R.mensal, ano_passado: R.ano_passado, ontem: R.ontem, estados: R.estados, estados_ly: R.estados_ly,
    produtos: compacta(anos('produtos_'), P),
    produtos_ontem: compacta(R.produtos_ontem.map((r) => ({ month: ref, ...r })), P),
    estoque: compacta(anos('estoque_'), E),
    estoque_ontem: compacta(R.estoque_ontem.map((r) => ({ month: ref, ...r })), E),
  };
  const tpl = await readFile(path.join(root, 'src', 'painel.html'), 'utf8');
  const d3 = await readFile(path.join(root, 'node_modules', 'd3', 'dist', 'd3.min.js'), 'utf8');
  if (/<\/script/i.test(d3)) throw new Error('d3 contém </script>');
  const json = JSON.stringify(dados).replace(/</g, '\\u003c');
  if (!tpl.includes('/*DADOS*/null')) throw new Error('Marcador de dados não encontrado no modelo');
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist', 'index.html'), tpl.replace('/*D3*/', () => d3).replace('/*DADOS*/null', () => json));
  console.log(`dist/index.html gerado (${(json.length / 1024).toFixed(0)} KB de dados, referência ${ref})`);
}

if (process.env.NAO_RODAR) {}
else if (process.argv[2] === '--consultas') console.log(JSON.stringify(consultas(), null, 2));
else main().catch((e) => { console.error(e.message); process.exit(1); });
