# Rotina diária do painel

Todo dia, com a venda fechada até ontem:

1. Consultas do Shopify (`node scripts/build.mjs --consultas`) salvas com `scripts/salvar.mjs` em `.dados/`.
2. Preços e produtos: `scripts/precos_dados.mjs` (GraphQL do Shopify, sempre a consulta de `--consulta`, que traz ativos,
   rascunhos e ocultos + banco do Controle de Precificação). Rascunhos e ocultos vão em `rascunhos`: só aparecem na aba
   Estoque (filtro Rascunhos), sem previsão nem compra; as demais abas usam só os ativos.
3. Estoque do Bling por depósito: `scripts/bling_estoque.mjs` (`--lotes`, listProducts com id, `--ids`, getStockBalance).
4. Vendas novas do Mercado Livre: `scripts/ml_vendas.mjs` (`--consulta`, `--novos`, getSalesOrder dos novos, merge).
   Nada de dados pessoais dos compradores.
5. **Alerta de transferência para o escritório (todo dia):**
   `node scripts/transferencia_email.mjs .dados <estado_anterior.json> <saída>` com o estado guardado no painel do Claude
   (`alertas/transferencia_ml`). Se `enviar.txt` = `sim`: confira no Gmail (enviados) que o mesmo assunto não foi
   enviado hoje, envie `email.txt` (texto puro) para comercial@pintame.com.br e grave o novo estado.
6. Segunda-feira: e-mail semanal de ruptura (`scripts/ruptura_email.mjs`, estado em `alertas/ruptura_semanal`).
7. **Foto do estoque (todo dia, antes dos arquivos do painel):**
   `node scripts/foto_estoque.mjs .dados <fotos_anteriores.json>` com o histórico guardado no painel do Claude
   (`alertas/fotos_estoque`, campo `json`). Grava `fotos` dentro de `estoque_bling.json`, que a Leitura do analista da
   aba Estoque usa para mostrar o que é novo no dia e na semana. Depois grave o novo histórico em `alertas/fotos_estoque`.
   Durante a Black Friday (até 30/11), as consultas de promoção (promo_loja, promo_sessoes, promo_produtos e
   promo_est do dia) mudam todo dia.
8. Arquivos dos datasets do painel do Claude (estados, historico_produtos, promocoes, precificacao, estoque_bling,
   ml_vendas) e, por último, `scripts/publicar.sh` (apaga `.dados`).
