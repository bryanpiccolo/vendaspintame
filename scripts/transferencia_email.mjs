// Alerta de transferência Correios -> Escritório (o escritório abastece o Mercado Livre).
// Quando alguma peça do sortimento do ML está para zerar no escritório, gera o e-mail para comercial@ com a sugestão
// de transferência (a mesma conta do quadro da aba Estoque: Previsao.transferenciaML, 30 dias de cobertura no escritório
// e 30 dias do site guardados nos Correios).
//
// "Para zerar": peça do sortimento do ML com transferência sugerida e escritório zerado, ou que vendeu no ML e tem
// 1 peça ou menos, ou estoque para menos de 7 dias de ML.
// Para não repetir o mesmo e-mail todo dia: só envia se entrou peça nova na lista de "para zerar" desde o último envio,
// ou se o último envio foi há 3 dias ou mais e a lista continua com peças.
//
// Uso:
//   node scripts/transferencia_email.mjs <pasta .dados> <estado_anterior.json|-> <pasta de saída>
//     <pasta .dados>: as consultas do painel + estoque_bling.json (com depósitos), ml_vendas.json e precos.json
//     gera assunto.txt, email.txt (texto puro, ASCII, sem links), estado.json e enviar.txt ("sim" ou "nao")
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
process.env.NAO_RODAR = '1';
const B = await import('./build.mjs');
await import('../src/previsao.js');
const Previsao = globalThis.Previsao;

const NOMES = ['estados', 'diario', 'produtos_hist', 'produtos_rec', 'estoque_ontem', 'dias_sem_estoque'];
const DIAS_ALERTA = 7, REPETE_DIAS = 3;
const [, , pasta, anterior, saida] = process.argv;
if (!pasta || !anterior || !saida) { console.error('Uso: node scripts/transferencia_email.mjs <pasta .dados> <estado_anterior.json|-> <pasta de saída>'); process.exit(1); }
const todas = B.consultas();
const R0 = {};
for (const n of NOMES) {
  const j = JSON.parse(await readFile(path.join(pasta, n + '.json'), 'utf8'));
  if (j.query && j.query.trim() !== todas[n].trim()) throw new Error(`O arquivo ${n}.json é de outra consulta`);
  R0[n] = B.normaliza(j, n);
}
const le = async (n) => (existsSync(path.join(pasta, n)) ? JSON.parse(await readFile(path.join(pasta, n), 'utf8')) : null);
const ref = B.ref;
const mes = (r) => String(r.month || r.day).slice(0, 7), dia = (r) => String(r.day).slice(0, 10);
const P = ['month', 'product_type', 'product_title', 'product_variant_title', 'net_items_sold', 'gross_sales', 'discounts', 'sales_reversals', 'net_sales', 'shipping_charges', 'cost_of_goods_sold', 'gross_profit'];
const precos = await le('precos.json');
const D = {
  referencia: ref,
  mensal: B.somaPor(R0.estados, mes).map(({ _k, ...v }) => ({ month: _k + '-01', ...v })),
  diario_total: B.somaPor(R0.diario, dia).map(({ _k, ...v }) => ({ day: _k, ...v })).sort((a, b) => (a.day < b.day ? -1 : 1)),
  produtos: B.compacta([...R0.produtos_hist, ...R0.produtos_rec], P),
  estoque_ontem: R0.estoque_ontem.map((r) => ({ month: ref, ...r })),
  dias_sem_estoque: R0.dias_sem_estoque,
  estoque_bling: await le('estoque_bling.json'),
  ml_vendas: await le('ml_vendas.json'),
  precos,
  ativos: precos ? Previsao.ativosDe(precos.produtos) : null,
};
if (!D.estoque_bling || !D.estoque_bling.depositos) throw new Error('Falta estoque_bling.json com o saldo por depósito');
if (!D.ml_vendas) throw new Error('Falta ml_vendas.json');
const R = Previsao.calcula(D, { prazo: 22, cobertura: 60 });
const T = Previsao.transferenciaML(D, R, { dias: 30, reserva: 30 });

const urg = T.rows.filter((r) => r.transf > 0 && (r.esc === 0 || (r.v > 0 && (r.esc <= 1 || (r.diasEsc != null && r.diasEsc < DIAS_ALERTA)))));
const semNada = T.rows.filter((r) => r.curto > 0 && r.esc === 0 && r.cor === 0);
const sug = T.rows.filter((r) => r.transf > 0);

let ant = null;
if (anterior !== '-' && existsSync(anterior)) { try { ant = JSON.parse(await readFile(anterior, 'utf8')); } catch { ant = null; } }
const antSet = new Set((ant && ant.urgentes) || []);
const novos = urg.filter((r) => !antSet.has(r.k));
const diasDesde = ant && ant.data ? Math.round((Date.parse(T.hoje + 'T12:00:00Z') - Date.parse(ant.data + 'T12:00:00Z')) / 86400000) : Infinity;
const enviar = urg.length > 0 && (novos.length > 0 || diasDesde >= REPETE_DIAS);

// ---------- texto (ASCII, sem links) ----------
const ascii = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[—–]/g, '-').replace(/→/g, '>').replace(/[^\x00-\x7F]/g, '');
const nome = (n) => n.replace(/\s*(Tam\.?|Tamanho)\s*:\s*/gi, ' ').replace(/Cor( Ribana)?\s*:\s*/gi, '').replace(/;/g, ' ').replace(/\s+/g, ' ').trim();
const br = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const lido = new Date(D.estoque_bling.gerado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const porNome = (a, b) => nome(a.nome).localeCompare(nome(b.nome), 'pt-BR');
const L = [];
L.push('Ola!', '');
L.push(`Pecas do Mercado Livre acabando no escritorio (estoque do Bling lido em ${lido}):`);
for (const r of urg.slice().sort(porNome)) {
  const quando = r.esc === 0 ? 'zerado no escritorio' : r.diasEsc != null ? `escritorio ${r.esc} (da para uns ${Math.max(1, Math.floor(r.diasEsc))} dias)` : `escritorio ${r.esc}`;
  L.push(`- ${nome(r.nome)}: ${quando} - transferir ${r.transf}${antSet.size && !antSet.has(r.k) ? ' [NOVO]' : ''}`);
}
L.push('', `SUGESTAO DE TRANSFERENCIA CORREIOS > ESCRITORIO (cobre o ML ate ${br(T.ate)})`);
for (const r of sug.slice().sort(porNome)) L.push(`${nome(r.nome)} - ${r.transf}`);
L.push(`Total: ${sug.reduce((a, r) => a + r.transf, 0)} pecas`);
if (semNada.length) { L.push('', 'Sem estoque no escritorio nem nos Correios (precisa de compra):'); for (const r of semNada) L.push(`- ${nome(r.nome)}`); }
L.push('', `Como funciona - O escritorio abastece o Mercado Livre. A sugestao deixa no escritorio no minimo 2 de cada peca do ML (3 do que vendeu no ML) ou a venda prevista do ML para 30 dias, se for maior, e mantem nos Correios a venda prevista do site para 30 dias. Quando nao da para os dois, o estoque e dividido na proporcao da venda de cada canal. Mesma conta do quadro de transferencia da aba Estoque do painel.`);
const texto = ascii(L.join('\n'));
const assunto = ascii(`Transferencia Correios > Escritorio (ML) - ${urg.length} ${urg.length === 1 ? 'peca acabando' : 'pecas acabando'} - ${br(T.hoje)}`);

await mkdir(saida, { recursive: true });
await writeFile(path.join(saida, 'assunto.txt'), assunto);
await writeFile(path.join(saida, 'email.txt'), texto);
await writeFile(path.join(saida, 'enviar.txt'), enviar ? 'sim' : 'nao');
await writeFile(path.join(saida, 'estado.json'), JSON.stringify(enviar ? { data: T.hoje, urgentes: urg.map((r) => r.k) } : (ant || { data: null, urgentes: [] })));
console.log(`ok: ${urg.length} pecas acabando no escritorio (${novos.length} novas), ${sug.length} com transferencia sugerida; enviar: ${enviar ? 'sim' : 'nao'}`);
