// Gera o arquivo de vendas por estado do painel do Claude a partir da resposta "estados" já salva
// (a mesma consulta do painel do GitHub). Uso: node scripts/estados_artefato.mjs .dados/estados.json saida.json
import { readFile, writeFile } from 'node:fs/promises';
process.env.NAO_RODAR = '1';
const { normaliza } = await import('./build.mjs');
const [, , entrada, saida] = process.argv;
if (!entrada || !saida) { console.error('Uso: node scripts/estados_artefato.mjs <estados.json> <saida.json>'); process.exit(1); }
const j = JSON.parse(await readFile(entrada, 'utf8'));
const rows = normaliza(j, 'estados');
if (!rows.length || !('shipping_region' in rows[0])) throw new Error('A resposta não tem vendas por estado');
await writeFile(saida, JSON.stringify(rows));
const meses = [...new Set(rows.map((r) => String(r.month).slice(0, 7)))].sort();
console.log(`ok: ${rows.length} linhas, de ${meses[0]} a ${meses[meses.length - 1]}`);
