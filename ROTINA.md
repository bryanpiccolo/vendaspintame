# Rotina diária do painel

Todo dia, com a venda fechada até ontem:

1. Consultas do Shopify (`node scripts/build.mjs --consultas`) salvas com `scripts/salvar.mjs` em `.dados/`.
2. Preços e produtos ativos: `scripts/precos_dados.mjs` (GraphQL do Shopify + banco do Controle de Precificação).
3. Estoque do Bling por depósito: `scripts/bling_estoque.mjs` (`--lotes`, listProducts com id, `--ids`, getStockBalance).
4. Vendas novas do Mercado Livre: `scripts/ml_vendas.mjs` (`--consulta`, `--novos`, getSalesOrder dos novos, merge).
   Nada de dados pessoais dos compradores.
5. **Alerta de transferência para o escritório (todo dia):**
   `node scripts/transferencia_email.mjs .dados <estado_anterior.json> <saída>` com o estado guardado no painel do Claude
   (`alertas/transferencia_ml`). Se `enviar.txt` = `sim`: confira no Gmail (enviados) que o mesmo assunto não foi
   enviado hoje, envie `email.txt` (texto puro) para comercial@pintame.com.br e grave o novo estado.
6. Segunda-feira: e-mail semanal de ruptura (`scripts/ruptura_email.mjs`, estado em `alertas/ruptura_semanal`).
7. Arquivos dos datasets do painel do Claude (estados, historico_produtos, promocoes, precificacao, estoque_bling,
   ml_vendas) e, por último, `scripts/publicar.sh` (apaga `.dados`).
