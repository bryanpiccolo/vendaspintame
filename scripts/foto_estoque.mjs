// Foto diária do estoque (peça = produto | tamanho): quem está sem estoque, quem acaba antes da reposição e quem
// precisa de compra, pela mesma previsão da aba Estoque (src/previsao.js, prazo 22 e cobertura 60 dias).
// A aba Estoque compara a foto de hoje com a de ontem e a de 7 dias atrás para mostrar o que é novo na
// "Leitura do analista".
//
// Uso:
//   node scripts/foto_estoque.mjs <pasta .dados> <fotos_anteriores.json|->
//     grava <pasta>/fotos_estoque.json (histórico dos últimos 15 dias, {fotos: {AAAA-MM-DD: {sem, acaba, comprar}}})
//     e copia o histórico para o campo "fotos" de <pasta>/estoque_bling.json (vai para o painel junto com o estoque).
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
process.env.NAO_RODAR = '1';
const B = await import('./build.mjs');
await import('../src/previsao.js');
const Previsao = globalThis.Previsao;

const NOMES = ['estados', 'diario', 'produtos_hist', 'produtos_rec', 'estoque_ontem', 'dias_sem_estoque'];
const PRAZO = 22, COBERTURA = 60, GUARDA = 15;
// Mesmos produtos que ficam fora do risco de ruptura na aba Estoque (src/estoque.js).
const FORA = [/copa do mundo|futebol|amarelinho|⚽/i, /camiseta adulto/i, /camiseta bolso/i, /^kit de \d+ canetinhas/i, /scrunchie/i, /^cal[cç]a/i, /estojo|lancheira/i, /mochila/i, /bermuda|short/i, /casaco|blus[aã]o|moletom|jaqueta/i, /embalagem|envelope|sacola/i];

const [, , pasta, anterior] = process.argv;
if (!pasta || !anterior) { console.error('Uso: node scripts/foto_estoque.mjs <pasta .dados> <fotos_anteriores.json|->'); process.exit(1); }
const todas = B.consultas();
const R = {};
for (const n of NOMES) {
  const j = JSON.parse(await readFile(path.join(pasta, n + '.json'), 'utf8'));
  if (j.query && j.query.trim() !== todas[n].trim()) throw new Error(`O arquivo ${n}.json é de outra consulta`);
  R[n] = B.normaliza(j, n);
}
const ref = B.ref;
const mes = (r) => String(r.month || r.day).slice(0, 7), dia = (r) => String(r.day).slice(0, 10);
const P = ['month', 'product_type', 'product_title', 'product_variant_title', 'net_items_sold', 'gross_sales', 'discounts', 'sales_reversals', 'net_sales', 'shipping_charges', 'cost_of_goods_sold', 'gross_profit'];
const blingArq = path.join(pasta, 'estoque_bling.json');
const bling = existsSync(blingArq) ? JSON.parse(await readFile(blingArq, 'utf8')) : null;
const D = {
  referencia: ref,
  mensal: B.somaPor(R.estados, mes).map(({ _k, ...v }) => ({ month: _k + '-01', ...v })),
  diario_total: B.somaPor(R.diario, dia).map(({ _k, ...v }) => ({ day: _k, ...v })).sort((a, b) => (a.day < b.day ? -1 : 1)),
  produtos: B.compacta([...R.produtos_hist, ...R.produtos_rec], P),
  estoque_ontem: R.estoque_ontem.map((r) => ({ month: ref, ...r })),
  dias_sem_estoque: R.dias_sem_estoque,
  estoque_bling: bling,
  ativos: existsSync(path.join(pasta, 'precos.json')) ? Previsao.ativosDe(JSON.parse(await readFile(path.join(pasta, 'precos.json'), 'utf8')).produtos) : null,
};
const res = Previsao.calcula(D, { prazo: PRAZO, cobertura: COBERTURA });
const limite = Previsao.addDias(ref, PRAZO);
const itens = res.itens.filter((i) => i.share > 0 && !FORA.some((re) => re.test(i.produto) || re.test(i.categoria)));
const chave = (i) => i.produto + ' | ' + i.variante;
const foto = {
  sem: itens.filter((i) => i.estoque <= 0).map(chave).sort(),
  acaba: itens.filter((i) => i.estoque > 0 && i.ruptura && i.ruptura !== 'agora' && i.ruptura <= limite).map(chave).sort(),
  comprar: itens.filter((i) => i.comprar > 0).map(chave).sort(),
};
let hist = { fotos: {} };
if (anterior !== '-' && existsSync(anterior)) { try { const h = JSON.parse(await readFile(anterior, 'utf8')); if (h && h.fotos) hist = h; } catch { /* começa do zero */ } }
hist.fotos[ref] = foto;
const datas = Object.keys(hist.fotos).sort();
for (const d of datas.slice(0, Math.max(0, datas.length - GUARDA))) delete hist.fotos[d];
await writeFile(path.join(pasta, 'fotos_estoque.json'), JSON.stringify(hist));
if (bling) { bling.fotos = hist.fotos; await writeFile(blingArq, JSON.stringify(bling)); }
console.log(`ok: foto de ${ref} (${foto.sem.length} sem estoque, ${foto.acaba.length} acabam até ${limite}, ${foto.comprar.length} para comprar); ${Object.keys(hist.fotos).length} fotos no histórico${bling ? '' : ' (sem estoque_bling.json: o painel não recebe as fotos)'}`);
