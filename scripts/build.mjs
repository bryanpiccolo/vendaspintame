// Monta dist/index.html com a venda fechada até o dia anterior.
//
// Os números vêm de respostas do relatório do Shopify (ShopifyQL) salvas em DADOS_DIR,
// uma por consulta, com o nome da consulta: DADOS_DIR/<nome>.json.
// A lista de consultas sai de: node scripts/build.mjs --consultas
// Todas as consultas foram escolhidas para devolver bastante linhas (o agendamento salva
// cada resposta direto em arquivo); os totais menores são calculados a partir delas.
//
// Variáveis:
//   DADOS_DIR   pasta com as respostas (obrigatória)
//   REF_DATE    último dia fechado, AAAA-MM-DD (padrão: ontem em Brasília)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const TZ = 'America/Sao_Paulo';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const ref = process.env.REF_DATE || addDias(hojeSP(), -1);
const Y = +ref.slice(0, 4);
const refLY = ref.slice(5) === '02-29' ? `${Y - 1}-02-28` : (Y - 1) + ref.slice(4); // mesmo dia, um ano antes
const inicioMesLY = refLY.slice(0, 8) + '01';

const M_VENDAS = 'orders, net_items_sold, gross_sales, discounts, sales_reversals, net_sales, shipping_charges, cost_of_goods_sold, gross_profit';
const M_PROD = 'net_items_sold, gross_sales, discounts, sales_reversals, net_sales, shipping_charges, cost_of_goods_sold, gross_profit';
const M_EST = 'starting_inventory_units, ending_inventory_units, inventory_units_sold';
const DIM = 'product_type, product_title, product_variant_title';
const L = 'LIMIT 20000';

export function consultas() {
  const q = {
    estados: `FROM sales SHOW ${M_VENDAS} GROUP BY month, shipping_region SINCE 2022-01-01 UNTIL ${ref} ORDER BY month ASC ${L}`,
    diario: `FROM sales SHOW ${M_VENDAS} GROUP BY day, shipping_region SINCE ${inicioMesLY} UNTIL ${ref} ORDER BY day ASC ${L}`,
    produtos_hist: `FROM sales SHOW ${M_PROD} GROUP BY month, ${DIM} SINCE 2022-01-01 UNTIL ${Y - 2}-12-31 ORDER BY month ASC ${L}`,
    produtos_rec: `FROM sales SHOW ${M_PROD} GROUP BY month, ${DIM} SINCE ${Y - 1}-01-01 UNTIL ${ref} ORDER BY month ASC ${L}`,
    produtos_dia: `FROM sales SHOW ${M_PROD} GROUP BY day, ${DIM} SINCE ${addDias(ref, -29)} UNTIL ${ref} ORDER BY day ASC ${L}`,
    estoque_ontem: `FROM inventory SHOW ${M_EST} GROUP BY ${DIM} SINCE ${ref} UNTIL ${ref} ORDER BY inventory_units_sold DESC ${L}`,
    estoque_2023_2024: `FROM inventory SHOW ${M_EST} GROUP BY month, ${DIM} SINCE 2023-01-01 UNTIL 2024-12-31 ORDER BY month ASC ${L}`,
  };
  for (let y = 2025; y <= Y; y++) q[`estoque_${y}`] = `FROM inventory SHOW ${M_EST} GROUP BY month, ${DIM} SINCE ${y}-01-01 UNTIL ${y === Y ? ref : y + '-12-31'} ORDER BY month ASC ${L}`;
  return q;
}

// Aceita a resposta como o conector devolve ({columns, rows: [[...]]}) ou como a API ({rows: [{...}]}).
export function normaliza(t, nome) {
  if (t && t.data && t.data.shopifyqlQuery) t = t.data.shopifyqlQuery.tableData;
  if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows)) throw new Error(`A resposta de "${nome}" não é uma tabela do Shopify`);
  const cols = t.columns.map((c) => ({ name: c.name, dataType: c.dataType || '' }));
  const num = new Set(cols.filter((c) => /MONEY|INTEGER|NUMBER|PERCENT|FLOAT|DECIMAL/.test(c.dataType)).map((c) => c.name));
  return t.rows.map((r) => {
    const o = Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [c.name, r[i]])) : r;
    return Object.fromEntries(cols.map((c) => { const v = o[c.name]; return [c.name, num.has(c.name) ? (v === '' || v == null ? null : Number(v)) : (v ?? '')]; }));
  });
}

async function le(nome, consultaEsperada) {
  const f = path.join(process.env.DADOS_DIR, nome + '.json');
  if (!existsSync(f)) throw new Error(`Falta a resposta "${nome}" em ${f}`);
  const j = JSON.parse(await readFile(f, 'utf8'));
  if (j.query && consultaEsperada && j.query.trim() !== consultaEsperada.trim()) throw new Error(`O arquivo ${nome}.json é de outra consulta (${j.query.slice(0, 120)}…)`);
  if (typeof j.rowCount === 'number' && Array.isArray(j.rows) && j.rowCount !== j.rows.length) throw new Error(`O arquivo ${nome}.json está incompleto (${j.rows.length} de ${j.rowCount} linhas)`);
  const rows = normaliza(j, nome);
  if (rows.length >= 20000) throw new Error(`A consulta ${nome} chegou ao limite de 20.000 linhas; é preciso dividir o período.`);
  return rows;
}

const VENDAS = ['orders', 'net_items_sold', 'gross_sales', 'discounts', 'sales_reversals', 'net_sales', 'shipping_charges', 'cost_of_goods_sold', 'gross_profit'];
const somaPor = (rows, chave) => {
  const m = new Map();
  for (const r of rows) {
    const k = chave(r);
    let a = m.get(k);
    if (!a) { a = { _k: k }; for (const c of VENDAS) a[c] = null; m.set(k, a); }
    for (const c of VENDAS) if (r[c] != null) a[c] = (a[c] || 0) + r[c];
  }
  for (const a of m.values()) for (const c of VENDAS) if (a[c] != null) a[c] = Math.round(a[c] * 100) / 100;
  return [...m.values()];
};

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
  if (!process.env.DADOS_DIR) throw new Error('Informe DADOS_DIR com a pasta das respostas do Shopify.');
  const q = consultas();
  const R = {};
  for (const [nome, consulta] of Object.entries(q)) { R[nome] = await le(nome, consulta); console.log(`${nome}: ${R[nome].length} linhas`); }

  const mes = (r) => String(r.month || r.day).slice(0, 7);
  const dia = (r) => String(r.day).slice(0, 10);
  const mesLY = refLY.slice(0, 7);

  // Totais por mês = soma dos estados (inclui pedidos sem estado).
  const mensal = somaPor(R.estados, mes).map(({ _k, ...v }) => ({ month: _k + '-01', ...v }));
  // Ontem = dia de referência no diário.
  const ontem = somaPor(R.diario.filter((r) => dia(r) === ref), () => 'x').map(({ _k, ...v }) => v);
  if (!ontem.length) ontem.push(Object.fromEntries(VENDAS.map((c) => [c, 0])));
  // Estados no ano passado até a mesma data: meses fechados + o mês de referência só até o mesmo dia.
  const lyFechados = R.estados.filter((r) => mes(r).startsWith(String(Y - 1)) && mes(r) < mesLY);
  const lyParcial = somaPor(R.diario.filter((r) => dia(r) >= inicioMesLY && dia(r) <= refLY), (r) => r.shipping_region || '')
    .map(({ _k, ...v }) => ({ month: mesLY + '-01', shipping_region: _k, ...v }));
  const estados_ly = [...lyFechados, ...lyParcial];
  const ano_passado = somaPor(estados_ly, mes).map(({ _k, ...v }) => ({ month: _k + '-01', ...v }));

  const P = ['month', 'product_type', 'product_title', 'product_variant_title', 'net_items_sold', 'gross_sales', 'discounts', 'sales_reversals', 'net_sales', 'shipping_charges', 'cost_of_goods_sold', 'gross_profit'];
  const E = ['month', 'product_type', 'product_title', 'product_variant_title', 'starting_inventory_units', 'ending_inventory_units', 'inventory_units_sold'];
  const prodOntem = R.produtos_dia.filter((r) => dia(r) === ref).map((r) => ({ ...r, month: ref }));
  const estoques = Object.keys(R).filter((k) => /^estoque_\d{4}/.test(k)).flatMap((k) => R[k]);

  const dados = {
    gerado_em: new Date().toISOString(),
    referencia: ref,
    mensal, ano_passado, ontem, estados: R.estados, estados_ly,
    produtos: compacta([...R.produtos_hist, ...R.produtos_rec], P),
    produtos_ontem: compacta(prodOntem, P),
    estoque: compacta(estoques, E),
    estoque_ontem: compacta(R.estoque_ontem.map((r) => ({ month: ref, ...r })), E),
  };
  const tpl = await readFile(path.join(root, 'src', 'painel.html'), 'utf8');
  const d3 = await readFile(path.join(root, 'node_modules', 'd3', 'dist', 'd3.min.js'), 'utf8');
  if (/<\/script/i.test(d3)) throw new Error('d3 contém </script>');
  if (!tpl.includes('/*DADOS*/null')) throw new Error('Marcador de dados não encontrado no modelo');
  const json = JSON.stringify(dados).replace(/</g, '\\u003c');
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist', 'index.html'), tpl.replace('/*D3*/', () => d3).replace('/*DADOS*/null', () => json));
  console.log(`dist/index.html gerado (${(json.length / 1024).toFixed(0)} KB de dados, venda fechada até ${ref})`);
}

if (process.env.NAO_RODAR) { /* importado em teste */ }
else if (process.argv[2] === '--consultas') console.log(JSON.stringify(consultas(), null, 2));
else main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
