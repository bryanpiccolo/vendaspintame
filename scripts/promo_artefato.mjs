// Gera o arquivo de dados da aba "Relatórios de promoção" do painel do Claude (dataset "promocoes")
// a partir das respostas promo_* já salvas em .dados/.
// Uso: node scripts/promo_artefato.mjs .dados saida.json
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
process.env.NAO_RODAR = '1';
const { normaliza, promoConsultas, promoDados, ref } = await import('./build.mjs');
const [, , pasta, saida] = process.argv;
if (!pasta || !saida) { console.error('Uso: node scripts/promo_artefato.mjs <pasta .dados> <saida.json>'); process.exit(1); }
const R = {};
for (const [nome, consulta] of Object.entries(promoConsultas())) {
  const j = JSON.parse(await readFile(path.join(pasta, nome + '.json'), 'utf8'));
  if (j.query && j.query.trim() !== consulta.trim()) throw new Error(`O arquivo ${nome}.json é de outra consulta`);
  R[nome] = normaliza(j, nome);
}
const p = promoDados(R);
const linhas = [{ t: 'ref', referencia: ref }];
for (const r of p.loja) linhas.push({ t: 'loja', ...r });
for (const r of p.sessoes) linhas.push({ t: 'ses', ...r });
for (const r of p.produtos) linhas.push({ t: 'prod', ...r });
for (const [fim, rows] of Object.entries(p.estoque)) for (const r of rows) linhas.push({ t: 'est', fim, ...r });
// O painel do Claude monta as colunas a partir das primeiras linhas: todas as linhas levam os mesmos campos.
const campos = [...new Set(linhas.flatMap((r) => Object.keys(r)))];
const uniformes = linhas.map((r) => Object.fromEntries(campos.map((c) => [c, r[c] ?? null])));
await writeFile(saida, JSON.stringify(uniformes));
console.log(`ok: ${linhas.length} linhas (dados até ${ref})`);
