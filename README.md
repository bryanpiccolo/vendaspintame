# Painel de vendas Pinta Me

Painel com a venda **fechada até o dia anterior**, atualizado todo dia às 7h (horário de Brasília) e protegido por senha.

## Como funciona

1. Todo dia às 7h, o GitHub Actions roda `scripts/build.mjs`, que busca no Shopify os relatórios de vendas e de estoque (ShopifyQL, só leitura).
2. Os números entram na página `src/painel.html`, que é criptografada com a senha do time (AES-256, via [StatiCrypt](https://github.com/robinmoisson/staticrypt)).
3. Só a página criptografada é publicada no GitHub Pages. Os dados abertos nunca são gravados no repositório: eles existem apenas durante a execução.

O que fica público neste repositório é só o código. Sem a senha, a página publicada é ilegível.

## Configuração (uma vez só)

### 1. App no Shopify (só leitura)

1. Acesse o [Dev Dashboard](https://dev.shopify.com/dashboard) com a conta dona da loja e clique em **Create app**. Dê um nome, por exemplo `Painel de vendas`.
2. Em **Versions**, crie uma versão com os escopos `read_reports`, `read_orders`, `read_products` e `read_inventory`, depois clique em **Release**.
   - O relatório de vendas (ShopifyQL) também exige acesso a dados protegidos de clientes. Se o Dev Dashboard pedir, solicite esse acesso na mesma tela.
3. Instale o app na loja **pintamemais**.
4. Em **App settings**, copie o **Client ID** e o **Client secret**.

### 2. Segredos no GitHub

Em **Settings → Secrets and variables → Actions → New repository secret**, crie:

| Segredo | Valor |
|---|---|
| `SHOPIFY_CLIENT_ID` | Client ID do app |
| `SHOPIFY_CLIENT_SECRET` | Client secret do app |
| `PAINEL_SENHA` | Senha do time, com pelo menos 12 caracteres (de preferência uma frase) |

Se a loja tiver um token antigo `shpat_...` de app personalizado, ele também serve: cadastre como `SHOPIFY_TOKEN` no lugar dos dois primeiros.

### 3. Ligar o GitHub Pages

Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.

### 4. Primeira atualização

Em **Actions → Atualizar painel de vendas → Run workflow**. Em uns 2 minutos o painel fica no endereço mostrado em **Settings → Pages**.

## Uso no dia a dia

- **Atualizar fora do horário:** Actions → Atualizar painel de vendas → Run workflow.
- **Trocar a senha:** edite o segredo `PAINEL_SENHA` e rode o workflow. Quem marcou "Lembrar neste aparelho" vai precisar digitar a senha nova.
- **Se a atualização falhar:** o GitHub manda e-mail para quem configurou o repositório. A mensagem de erro aparece em Actions, no passo que falhou.

## Testar localmente

```bash
npm ci
FIXTURES_DIR=teste/fixtures REF_DATE=2026-10-07 npm run build   # usa respostas salvas em vez da API
STATICRYPT_PASSWORD=uma-senha-de-teste npm run proteger          # gera site/index.html criptografado
```

A pasta `teste/fixtures/` tem dados reais e está no `.gitignore`: **nunca suba esses arquivos**.

## Definições

- **GMV** = vendas brutas − descontos + frete pago pelo cliente. Devoluções não são abatidas.
- **Receita líquida** = vendas brutas − descontos − devoluções, sem frete.
- **Margem bruta** = receita líquida − CMV, como o Shopify calcula. O CMV é o custo da variante registrado no momento da venda.
- **Sell-through** = peças vendidas ÷ (vendidas + estoque no fim do período).
- **Estampa** é lida do nome do produto. **Tamanho** é lido do nome da variante.
