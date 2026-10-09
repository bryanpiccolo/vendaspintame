// Só no painel do Claude: monta os dados da aba Estoque a partir das consultas ao vivo (venda até ontem).
(function () {
  let chave = null;
  const linhas = (x) => (Array.isArray(x) ? x : (x && x.rows) || []);
  window.estoqueOnData = () => {
    const ids = ['mensal', 'diario', 'pecas_meses', 'estoque_atual'];
    const ds = ids.map((id) => dash.data(id));
    const tb = document.querySelector('#est-tabela tbody');
    const falha = ds.findIndex((d) => d.status === 'error');
    if (falha >= 0) { if (tb) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.className = 'pm-txt pm-bad'; td.textContent = 'Não foi possível carregar os dados do Shopify (' + ids[falha] + '). Tente atualizar a página.'; tr.appendChild(td); tb.replaceChildren(tr); } return; }
    if (!ds.every((d) => d.status === 'ok')) return;
    const [mensal, diario, pecas, est] = ds.map((d) => linhas(d.data));
    const nova = [mensal.length, diario.length, pecas.length, est.length, diario.length ? String(diario[diario.length - 1].day) : ''].join('|');
    if (nova === chave) return;
    const dias = diario.map((r) => ({ day: String(r.day).slice(0, 10), net_items_sold: r.net_items_sold || 0, gross_sales: r.gross_sales || 0, discounts: r.discounts || 0, shipping_charges: r.shipping_charges || 0 }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));
    if (!dias.length) return;
    chave = nova;
    const ref = dias[dias.length - 1].day, mesRef = ref.slice(0, 7);
    const doMes = dias.filter((d) => d.day.startsWith(mesRef));
    const soma = (k) => doMes.reduce((a, b) => a + (b[k] || 0), 0);
    const meses = mensal.filter((r) => String(r.month).slice(0, 7) < mesRef).map((r) => ({ ...r, month: String(r.month).slice(0, 7) + '-01' }));
    meses.push({ month: mesRef + '-01', net_items_sold: soma('net_items_sold'), gross_sales: soma('gross_sales'), discounts: soma('discounts'), shipping_charges: soma('shipping_charges') });
    window.EstoqueAba.define({
      referencia: ref,
      mensal: meses,
      diario_total: dias,
      produtos: pecas.map((r) => ({ ...r, month: String(r.month).slice(0, 7) })),
      estoque_ontem: est,
    });
  };
})();
