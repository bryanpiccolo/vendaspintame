// Vendas do Mercado Livre pelo Bling (pedidos da loja do ML), para a projeção de transferência Correios -> Escritório.
// Guarda só o necessário de cada pedido: id, data, número na loja, situação, valor total e itens (código, quantidade, descrição).
// Nada de nome, documento ou endereço do comprador.
//
// O histórico é cumulativo: cada execução lê o arquivo anterior e busca só os pedidos novos.
//
// Uso:
//   node scripts/ml_vendas.mjs --consulta
//       imprime os parâmetros da chamada listSalesOrders do Bling (idLoja do ML, últimos 10 dias)
//   node scripts/ml_vendas.mjs --novos <anterior.json|-> <pasta-das-listas>
//       <pasta-das-listas>: respostas do listSalesOrders. Imprime um JSON com os IDs dos pedidos que ainda não estão
//       no arquivo anterior (cancelados ficam fora). Cada ID vai numa chamada getSalesOrder.
//   node scripts/ml_vendas.mjs <anterior.json|-> <pasta-dos-pedidos> <saída.json>
//       <pasta-dos-pedidos>: respostas do getSalesOrder (uma por arquivo). Junta com o anterior e grava a saída.
//       Respostas do listSalesOrders (com o campo total) na mesma pasta completam o valor dos pedidos já guardados.
//   node scripts/ml_vendas.mjs --artefato <ml_vendas.json> <saída.json>   (arquivo do dataset "ml_vendas" do painel do Claude)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const LOJA_ML = 206280473;
const CANCELADO = 12;
const DIAS_GUARDA = 400;
const TZ = 'America/Sao_Paulo';
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function objetos(txt) {
  // respostas do conector: JSON, às vezes com notas depois ("---\nNota: ..."), às vezes embrulhado em texto
  const t = String(txt).trim().split(/\n---\s*\n/)[0].trim();
  let j; try { j = JSON.parse(t); } catch { return []; }
  const out = [];
  const anda = (o, d = 0) => {
    if (!o || d > 8) return;
    if (typeof o === 'string') { const s = o.trim(); if (s.startsWith('{') || s.startsWith('[')) for (const x of objetos(s)) out.push(x); return; }
    if (Array.isArray(o)) { for (const x of o) anda(x, d + 1); return; }
    if (typeof o !== 'object') return;
    if (o.id && o.situacao && o.loja) { out.push(o); return; }
    for (const v of Object.values(o)) anda(v, d + 1);
  };
  anda(j);
  return out;
}
const lePasta = (p) => readdirSync(p).filter((f) => /\.(json|txt)$/i.test(f)).sort().flatMap((f) => objetos(readFileSync(path.join(p, f), 'utf8')));
const anterior = (arq) => { if (!arq || arq === '-' || !existsSync(arq)) return []; const j = JSON.parse(readFileSync(arq, 'utf8')); return Array.isArray(j) ? j : j.pedidos || []; };

const modo = process.argv[2];
if (modo === '--consulta') {
  console.log(JSON.stringify({ idLoja: LOJA_ML, dataInicial: addDias(hoje(), -10), dataFinal: hoje(), fields: ['id', 'data', 'situacao', 'loja'], limite: 100 }));
  process.exit(0);
}
if (modo === '--artefato') { const t = readFileSync(process.argv[3], 'utf8'); JSON.parse(t); writeFileSync(process.argv[4], JSON.stringify([{ j: t }])); console.log('ok'); process.exit(0); }
if (modo === '--novos') {
  const ja = new Set(anterior(process.argv[3]).map((p) => String(p.id)));
  const ids = [...new Set(lePasta(process.argv[4]).filter((o) => (o.loja && o.loja.id) === LOJA_ML && (o.situacao && o.situacao.id) !== CANCELADO && !ja.has(String(o.id))).map((o) => o.id))];
  console.log(JSON.stringify(ids));
  process.exit(0);
}

const [, , arqAnt, pasta, saida] = process.argv;
if (!arqAnt || !pasta || !saida) { console.error('Uso: node scripts/ml_vendas.mjs <anterior.json|-> <pasta-dos-pedidos> <saída.json>'); process.exit(1); }
const porId = new Map(anterior(arqAnt).map((p) => [String(p.id), p]));
let novos = 0;
const listas = [];
for (const o of lePasta(pasta)) {
  if ((o.loja && o.loja.id) !== LOJA_ML) continue;
  // resposta do listSalesOrders (sem itens): só serve para completar o valor do pedido (total) dos que já estão guardados
  if (!Array.isArray(o.itens)) { listas.push(o); continue; }
  if (!porId.has(String(o.id))) novos++;
  porId.set(String(o.id), { id: o.id, data: String(o.data).slice(0, 10), numeroLoja: o.numeroLoja || null, situacao: o.situacao && o.situacao.id, total: o.total != null ? Number(o.total) : null, itens: o.itens.map((i) => [String(i.codigo || ''), Number(i.quantidade) || 0, String(i.descricao || '')]) });
}
for (const o of listas) { const p = porId.get(String(o.id)); if (p && o.total != null) { p.total = Number(o.total); if (o.situacao) p.situacao = o.situacao.id; } }
const corte = addDias(hoje(), -DIAS_GUARDA);
// o mesmo pedido do ML às vezes entra duas vezes no Bling (mesmo número na loja): conta uma vez
const vistos = new Set();
const pedidos = [...porId.values()].filter((p) => p.data >= corte && p.situacao !== CANCELADO).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id - b.id))
  .filter((p) => { if (!p.numeroLoja) return true; if (vistos.has(p.numeroLoja)) return false; vistos.add(p.numeroLoja); return true; });
writeFileSync(saida, JSON.stringify({ gerado_em: new Date().toISOString(), loja: LOJA_ML, ate: addDias(hoje(), -1), desde: pedidos.length ? pedidos[0].data : null, pedidos }));
console.log(`ok: ${pedidos.length} pedidos do Mercado Livre (${novos} novos), de ${pedidos.length ? pedidos[0].data : '-'} a ${pedidos.length ? pedidos[pedidos.length - 1].data : '-'}`);
