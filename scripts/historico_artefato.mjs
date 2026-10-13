// Gera o arquivo de histórico mensal por produto e variante do painel do Claude (para o gráfico ao clicar num produto)
// a partir das respostas "produtos_hist" e "produtos_rec" já salvas.
// Uso: node scripts/historico_artefato.mjs .dados/produtos_hist.json .dados/produtos_rec.json saida.json
import { readFile, writeFile } from 'node:fs/promises';
process.env.NAO_RODAR = '1';
const { normaliza } = await import('./build.mjs');
const [, , a, b, saida] = process.argv;
if (!a || !b || !saida) { console.error('Uso: node scripts/historico_artefato.mjs <produtos_hist.json> <produtos_rec.json> <saida.json>'); process.exit(1); }
const rows = [];
for (const f of [a, b]) for (const r of normaliza(JSON.parse(await readFile(f, 'utf8')), f)) {
  if (!r.product_title) continue;
  const gmv = Math.round(((r.gross_sales || 0) + (r.discounts || 0)) * 100) / 100;
  if (!gmv && !r.net_items_sold) continue;
  rows.push({ month: String(r.month).slice(0, 7), product_type: r.product_type || '', product_title: r.product_title, product_variant_title: r.product_variant_title || '', net_items_sold: r.net_items_sold || 0, gmv });
}
await writeFile(saida, JSON.stringify(rows));
const meses = [...new Set(rows.map((r) => r.month))].sort();
console.log(`ok: ${rows.length} linhas, de ${meses[0]} a ${meses[meses.length - 1]}`);
