// Confere e guarda a resposta de uma consulta do Shopify para o build.
// Uso: node scripts/salvar.mjs <nome-da-consulta> <arquivo-com-a-resposta>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
process.env.NAO_RODAR = '1';
const { consultas } = await import('./build.mjs');
const [nome, arquivo] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = process.env.DADOS_DIR || path.join(root, '.dados');
const esperada = consultas()[nome];
if (!esperada) { console.error(`ERRO: consulta desconhecida "${nome}". Válidas: ${Object.keys(consultas()).join(', ')}`); process.exit(1); }
let j;
try { j = JSON.parse(await readFile(arquivo, 'utf8')); } catch (e) { console.error(`ERRO: ${arquivo} não é um JSON válido (${e.message})`); process.exit(1); }
if (!Array.isArray(j.columns) || !Array.isArray(j.rows)) { console.error(`ERRO: ${arquivo} não tem columns/rows`); process.exit(1); }
if ((j.query || '').trim() !== esperada.trim()) { console.error(`ERRO: o arquivo é de outra consulta.\nEsperada: ${esperada}\nNo arquivo: ${j.query}`); process.exit(1); }
if (typeof j.rowCount === 'number' && j.rowCount !== j.rows.length) { console.error(`ERRO: resposta incompleta (${j.rows.length} de ${j.rowCount} linhas)`); process.exit(1); }
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, nome + '.json'), JSON.stringify(j));
console.log(`ok ${nome}: ${j.rows.length} linhas`);
