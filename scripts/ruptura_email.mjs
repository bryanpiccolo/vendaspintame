// E-mail semanal de ruptura: peças (produto e tamanho) sem estoque e peças que acabam nas próximas 2 semanas,
// pela mesma previsão da aba Estoque (src/previsao.js), destacando o que entrou na lista desde o envio anterior.
//
// Uso:
//   node scripts/ruptura_email.mjs --consultas            consultas (ShopifyQL) necessárias, em JSON {nome: consulta}
//   node scripts/ruptura_email.mjs <pasta .dados> <estado_anterior.json|-> <pasta de saída>
//     gera na pasta de saída: assunto.txt, email.html, email.txt e estado.json (a guardar para a próxima semana)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
process.env.NAO_RODAR = '1';
const B = await import('./build.mjs');
await import('../src/previsao.js'); // define globalThis.Previsao
const Previsao = globalThis.Previsao;

const NOMES = ['estados', 'diario', 'produtos_hist', 'produtos_rec', 'estoque_ontem'];
const DIAS_PRE = 14; // pré-ruptura: acaba nos próximos 14 dias
// Mesmos produtos que ficam fora do risco de ruptura na aba Estoque (src/estoque.js).
const FORA = [/copa do mundo|futebol|⚽/i, /camiseta adulto/i, /camiseta bolso/i, /^kit de \d+ canetinhas/i, /scrunchie/i, /^cal[cç]a/i, /estojo|lancheira/i, /mochila/i, /bermuda|short/i, /casaco|blus[aã]o|moletom|jaqueta/i, /embalagem|envelope|sacola/i];

const todas = B.consultas();
if (process.argv[2] === '--consultas') { console.log(JSON.stringify(Object.fromEntries(NOMES.map((n) => [n, todas[n]])), null, 2)); process.exit(0); }
const [, , pasta, anterior, saida] = process.argv;
if (!pasta || !anterior || !saida) { console.error('Uso: node scripts/ruptura_email.mjs <pasta .dados> <estado_anterior.json|-> <pasta de saída>'); process.exit(1); }

const R = {};
for (const n of NOMES) {
  const j = JSON.parse(await readFile(path.join(pasta, n + '.json'), 'utf8'));
  if (j.query && j.query.trim() !== todas[n].trim()) throw new Error(`O arquivo ${n}.json é de outra consulta`);
  R[n] = B.normaliza(j, n);
}
const ref = B.ref;
const mes = (r) => String(r.month || r.day).slice(0, 7), dia = (r) => String(r.day).slice(0, 10);
const P = ['month', 'product_type', 'product_title', 'product_variant_title', 'net_items_sold', 'gross_sales', 'discounts', 'sales_reversals', 'net_sales', 'shipping_charges', 'cost_of_goods_sold', 'gross_profit'];
const D = {
  referencia: ref,
  mensal: B.somaPor(R.estados, mes).map(({ _k, ...v }) => ({ month: _k + '-01', ...v })),
  diario_total: B.somaPor(R.diario, dia).map(({ _k, ...v }) => ({ day: _k, ...v })).sort((a, b) => (a.day < b.day ? -1 : 1)),
  produtos: B.compacta([...R.produtos_hist, ...R.produtos_rec], P),
  estoque_ontem: R.estoque_ontem.map((r) => ({ month: ref, ...r })), // sem compactar: mantém o SKU das variantes zeradas
  // só produtos ativos no Shopify: lista em <pasta>/precos.json (scripts/precos_dados.mjs); sem ela, entram todos
  ativos: existsSync(path.join(pasta, 'precos.json')) ? Previsao.ativosDe(JSON.parse(await readFile(path.join(pasta, 'precos.json'), 'utf8')).produtos) : null,
};
if (!D.ativos) console.error('Aviso: sem precos.json na pasta; rascunhos e arquivados entram na lista.');
const res = Previsao.calcula(D, { prazo: 22, cobertura: 60 });
const limite = Previsao.addDias(ref, DIAS_PRE);
const itens = res.itens.filter((i) => i.share > 0 && !FORA.some((re) => re.test(i.produto) || re.test(i.categoria)));
const chave = (i) => i.produto + ' | ' + i.variante;
const doDia = (iso, n) => res.dias.filter((d) => d.dia > ref && d.dia <= Previsao.addDias(ref, n)).reduce((a, d) => a + d.valor, 0);
const loja14 = doDia(ref, DIAS_PRE);
const sem = itens.filter((i) => i.estoque <= 0).map((i) => ({ ...i, perda14: i.share * loja14 }));
const pre = itens.filter((i) => i.estoque > 0 && i.ruptura && i.ruptura !== 'agora' && i.ruptura <= limite).map((i) => ({ ...i, perda14: Math.max(0, i.share * loja14 - i.estoque) }));

let ant = null;
if (anterior !== '-' && existsSync(anterior)) { try { ant = JSON.parse(await readFile(anterior, 'utf8')); } catch { ant = null; } }
const antSem = new Set((ant && ant.ruptura) || []), antPre = new Set((ant && ant.pre) || []);
const temAnt = !!(ant && Array.isArray(ant.ruptura));
for (const i of sem) i.novo = temAnt && !antSem.has(chave(i)), i.veioDaPre = antPre.has(chave(i));
for (const i of pre) i.novo = temAnt && !antPre.has(chave(i)) && !antSem.has(chave(i));
const repostos = temAnt ? [...antSem].filter((k) => !sem.some((i) => chave(i) === k)) : [];
const ordena = (a, b) => (b.novo - a.novo) || (b.vendas_janela - a.vendas_janela) || a.produto.localeCompare(b.produto, 'pt-BR');
sem.sort(ordena); pre.sort((a, b) => (b.novo - a.novo) || (a.ruptura < b.ruptura ? -1 : a.ruptura > b.ruptura ? 1 : 0) || (b.vendas_janela - a.vendas_janela));

// ---------- texto ----------
const br = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const n0 = (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nome = (i) => i.produto.replace(/ Infantil para Colorir| para Colorir|\s*\+\s*0?6 canetinhas/gi, '').replace(/\s+/g, ' ').trim();
const tam = (i) => (i.tamanho && i.tamanho !== 'Único' ? i.tamanho : (i.variante !== 'Default Title' ? i.variante : 'Único'));
const sku = (i) => (i.skus || []).join(', ');
const novosSem = sem.filter((i) => i.novo).length, novosPre = pre.filter((i) => i.novo).length;
const janela = `${Previsao.REGRAS.mesesBase} últimos meses fechados + mês atual`;
const assunto = `Ruptura de estoque - semana de ${br(ref)} - ${sem.length} sem estoque, ${pre.length} acabam em 2 semanas` + (temAnt ? ` (${novosSem + novosPre} novos)` : '');

const H = [];
const th = (t, d) => `<th style="text-align:${d ? 'right' : 'left'};padding:6px 8px;border-bottom:2px solid #ccc;font-size:12px;color:#555">${t}</th>`;
const td = (t, d, novo) => `<td style="text-align:${d ? 'right' : 'left'};padding:5px 8px;border-bottom:1px solid #eee;font-size:13px${novo ? ';background:#fff4d6' : ''}">${t}</td>`;
H.push(`<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px">`);
H.push(`<p>Bom dia!</p><p>Peças do site em ruptura e em pré-ruptura, com a venda fechada até ${br(ref)}. ${temAnt ? `As linhas em <b style="background:#fff4d6">amarelo</b> são novas: não estavam na lista do envio anterior (${br(ant.referencia)}).` : 'Este é o primeiro envio: a partir do próximo, os itens novos da semana aparecem destacados.'}</p>`);
H.push(`<h2 style="font-size:17px;margin:22px 0 6px">1. Sem estoque (${sem.length}${temAnt ? `, ${novosSem} novos` : ''})</h2>`);
H.push(`<p style="font-size:12px;color:#555;margin:0 0 8px">Peças com venda recente e estoque zerado. "Venda perdida em 2 semanas" é a previsão de venda que não acontece se não houver reposição.</p>`);
if (sem.length) {
  H.push(`<table style="border-collapse:collapse;width:100%"><tr>${th('Produto')}${th('Tamanho')}${th('SKU')}${th('Vendidas (janela)', 1)}${th('Venda perdida em 2 semanas', 1)}${th('')}</tr>`);
  for (const i of sem) H.push(`<tr>${td(esc(nome(i)), 0, i.novo)}${td(esc(tam(i)), 0, i.novo)}${td(esc(sku(i)), 0, i.novo)}${td(n0(i.vendas_janela), 1, i.novo)}${td(n0(i.perda14), 1, i.novo)}${td(i.novo ? '<b>NOVO</b>' + (i.veioDaPre ? ' (estava em pré-ruptura)' : '') : '', 0, i.novo)}</tr>`);
  H.push(`</table>`);
} else H.push(`<p>Nenhuma peça com venda está sem estoque.</p>`);
H.push(`<h2 style="font-size:17px;margin:26px 0 6px">2. Pré-ruptura: acabam até ${br(limite)} (${pre.length}${temAnt ? `, ${novosPre} novos` : ''})</h2>`);
H.push(`<p style="font-size:12px;color:#555;margin:0 0 8px">Peças com estoque que, no ritmo previsto, acabam nas próximas 2 semanas. Ordenadas pela data em que acabam.</p>`);
if (pre.length) {
  H.push(`<table style="border-collapse:collapse;width:100%"><tr>${th('Produto')}${th('Tamanho')}${th('SKU')}${th('Estoque', 1)}${th('Acaba em', 1)}${th('Venda prevista em 2 semanas', 1)}${th('')}</tr>`);
  for (const i of pre) H.push(`<tr>${td(esc(nome(i)), 0, i.novo)}${td(esc(tam(i)), 0, i.novo)}${td(esc(sku(i)), 0, i.novo)}${td(n0(i.estoque), 1, i.novo)}${td(br(i.ruptura), 1, i.novo)}${td(n0(i.share * loja14), 1, i.novo)}${td(i.novo ? '<b>NOVO</b>' : '', 0, i.novo)}</tr>`);
  H.push(`</table>`);
} else H.push(`<p>Nenhuma peça deve acabar nas próximas 2 semanas.</p>`);
if (temAnt) H.push(`<p style="margin-top:18px">${repostos.length ? `<b>Saíram da lista de sem estoque desde o envio anterior (${repostos.length}):</b> ${esc(repostos.map((k) => k.replace(/ Infantil para Colorir| para Colorir|\s*\+\s*0?6 canetinhas/gi, '')).join('; '))}.` : 'Nenhuma peça saiu da lista de sem estoque desde o envio anterior.'}</p>`);
H.push(`<p style="font-size:11px;color:#777;margin-top:22px">Mesma previsão da aba Estoque do painel: participação de cada peça nas vendas dos ${janela}, sobre a previsão de vendas da loja dia a dia. Os kits com 6 e com 12 canetinhas contam como a mesma peça. Ficam fora os mesmos produtos que a aba Estoque tira do risco de ruptura (Copa do Mundo e Futebol, camisetas adulto e com bolso, kits de canetinhas, scrunchie, calças, estojos e lancheiras, mochilas, bermudas e shorts, casacos e moletons) e embalagens. Só vendas do site.</p></div>`);

// Texto simples e sem acento, no mesmo formato do Calendário e do alerta de prazos: é o que chega no comercial@.
const ascii = (x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E\n]/g, '').replace(/ +/g, ' ').trim();
const marca46 = (i) => (/^0?[46]$/.test(String(i.tamanho || '').trim()) ? '[04/06] ' : '');
const linhaSem = (i, k) => `${k}. ${marca46(i)}${i.novo ? '[NOVO] ' : ''}${nome(i)} - tam ${tam(i)} - SKU ${sku(i) || '-'} - vendidas na janela ${n0(i.vendas_janela)} - venda perdida em 2 semanas ${n0(i.perda14)}${i.novo && i.veioDaPre ? ' (estava em pre-ruptura)' : ''}`;
const linhaPre = (i, k) => `${k}. ${marca46(i)}${i.novo ? '[NOVO] ' : ''}${nome(i)} - tam ${tam(i)} - estoque ${n0(i.estoque)} - acaba em ${br(i.ruptura)} - venda prevista em 2 semanas ${n0(i.share * loja14)} - SKU ${sku(i) || '-'}`;
const T = [];
T.push('Bom dia!', '');
T.push(`Ruptura de estoque do site - venda fechada ate ${br(ref)}.`);
T.push(temAnt ? `[NOVO] = nao estava na lista do envio anterior (${br(ant.referencia)}).` : 'Primeiro envio: a partir do proximo, os itens novos da semana aparecem marcados com [NOVO].');
T.push('', 'RESUMO', `- Sem estoque: ${sem.length}${temAnt ? ` (${novosSem} novos)` : ''}`, `- Acabam ate ${br(limite)}: ${pre.length}${temAnt ? ` (${novosPre} novos)` : ''}`);
// Tamanhos 04 e 06 (os que mais vendem) em destaque
const t46 = (i) => /^0?[46]$/.test(String(i.tamanho || '').trim());
const sem46 = sem.filter(t46), pre46 = pre.filter(t46);
T.push(`- Nos tamanhos 04 e 06: ${sem46.length} sem estoque e ${pre46.length} acabando`);
T.push('', `>>> DESTAQUE: TAMANHOS 04 E 06 (os que mais vendem) - ${sem46.length + pre46.length} pecas <<<`);
if (sem46.length + pre46.length) {
  sem46.forEach((i) => T.push(`- SEM ESTOQUE: ${i.novo ? '[NOVO] ' : ''}${nome(i)} - tam ${tam(i)} - venda perdida em 2 semanas ${n0(i.perda14)} - SKU ${sku(i) || '-'}`));
  pre46.forEach((i) => T.push(`- ACABA EM ${br(i.ruptura)}: ${i.novo ? '[NOVO] ' : ''}${nome(i)} - tam ${tam(i)} - estoque ${n0(i.estoque)} - SKU ${sku(i) || '-'}`));
} else T.push('Nenhuma peca nos tamanhos 04 e 06 sem estoque ou acabando nas proximas 2 semanas.');
if (temAnt) T.push(`- Repostos desde o envio anterior: ${repostos.length}`);
if (temAnt && novosSem + novosPre) {
  T.push('', 'NOVOS NA LISTA DESTA SEMANA');
  sem.filter((i) => i.novo).forEach((i, k) => T.push(linhaSem(i, k + 1).replace(/^\d+\. \[NOVO\] /, '- Sem estoque: ')));
  pre.filter((i) => i.novo).forEach((i, k) => T.push(linhaPre(i, k + 1).replace(/^\d+\. \[NOVO\] /, '- Pre-ruptura: ')));
}
T.push('', `SEM ESTOQUE (${sem.length})`);
if (sem.length) sem.forEach((i, k) => T.push(linhaSem(i, k + 1))); else T.push('Nenhuma peca com venda esta sem estoque.');
T.push('', `PRE-RUPTURA - ACABAM ATE ${br(limite)} (${pre.length})`);
if (pre.length) pre.forEach((i, k) => T.push(linhaPre(i, k + 1))); else T.push('Nenhuma peca deve acabar nas proximas 2 semanas.');
if (temAnt) { T.push('', `REPOSTOS - SAIRAM DA LISTA DE SEM ESTOQUE (${repostos.length})`); if (repostos.length) for (const k of repostos) T.push('- ' + k.replace(/ Infantil para Colorir| para Colorir|\s*\+\s*0?6 canetinhas/gi, '').replace(' | ', ' - tam ')); else T.push('Nenhum.'); }
T.push('', 'Como funciona - mesma previsao da aba Estoque do painel: participacao de cada peca nas vendas dos 2 ultimos meses fechados + mes atual, sobre a previsao de vendas da loja dia a dia. Pre-ruptura = estoque acaba nas proximas 2 semanas. [04/06] = tamanhos 04 e 06, os que mais vendem. Kits com 6 e 12 canetinhas contam como a mesma peca. Ficam fora os mesmos produtos que a aba Estoque tira do risco de ruptura (Copa do Mundo e Futebol, camisetas adulto e com bolso, kits de canetinhas, scrunchie, calcas, estojos e lancheiras, mochilas, bermudas e shorts, casacos e moletons) e embalagens. So vendas do site.');
const assuntoTxt = ascii(`Ruptura de estoque - semana ${br(ref)} - ${sem.length} sem estoque, ${pre.length} acabam em 2 semanas - ${sem.filter(t46).length + pre.filter(t46).length} nos tam 04 e 06` + (temAnt ? ` - ${novosSem + novosPre} novos` : ''));

await mkdir(saida, { recursive: true });
await writeFile(path.join(saida, 'assunto.txt'), assuntoTxt);
await writeFile(path.join(saida, 'email.html'), H.join('\n'));
await writeFile(path.join(saida, 'email.txt'), T.map(ascii).join('\n'));
await writeFile(path.join(saida, 'estado.json'), JSON.stringify({ referencia: ref, ruptura: sem.map(chave), pre: pre.map(chave) }));
console.log(`ok: ${sem.length} sem estoque (${novosSem} novos), ${pre.length} em pré-ruptura (${novosPre} novos), ${repostos.length} repostos`);
