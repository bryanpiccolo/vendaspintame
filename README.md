# Painel de vendas Pinta Me

Painel com a venda **fechada até o dia anterior**, atualizado todo dia às 7h (horário de Brasília) e protegido por senha. Tem três abas: vendas mês a mês, vendas por produto (com sell-through) e vendas por estado.

## Como funciona

1. Todo dia às 7h, o GitHub Actions roda `scripts/build.mjs`, que busca no Shopify os relatórios de vendas e de estoque (ShopifyQL, só leitura).
2. Os números entram na página `src/painel.html`, que é criptografada com a senha do time (AES-256, via [StatiCrypt](https://github.com/robinmoisson/staticrypt)).
3. Só a página criptografada é publicada no GitHub Pages. Os dados abertos nunca são gravados no repositório: eles existem apenas durante a execução.

O que fica público neste repositório é só o código. Sem a senha, a página publicada é ilegível.

## Configuração (uma vez só)

### Passo 1. Criar o repositório
1. Entre no GitHub com a conta `bryanpiccolo`.
2. Clique em **+** (canto superior direito) → **New repository**.
3. Em **Repository name**, digite `vendaspintame`.
4. Marque **Public**. No plano grátis, o GitHub Pages só funciona com repositório público. Só o código fica visível, nunca os dados.
5. **Não** marque "Add a README", ".gitignore" nem "license". O repositório precisa nascer vazio.
6. Clique em **Create repository**.

### Passo 2. Enviar o código
Avise o Claude que o repositório foi criado. Ele envia os arquivos.

### Passo 3. Criar o app de leitura no Shopify
1. Acesse [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard) com a conta dona da loja.
2. Clique em **Create app** → **Start from Dev Dashboard**. Dê o nome `Painel de vendas`.
3. Abra a aba **Versions** e crie uma versão:
   - Em **Scopes**, marque só `read_reports`, `read_orders`, `read_products` e `read_inventory`.
   - Deixe o resto como está e clique em **Release**.
   - O relatório de vendas (ShopifyQL) exige acesso a "dados protegidos de clientes". Se aparecer esse pedido, solicite na mesma área. O painel não lê nome, e-mail nem endereço de clientes, só os totais.
4. Volte para a página do app → **Install app** → escolha a loja **pintamemais** → **Install**.
5. Abra **Settings** (ou **App settings**) e copie o **Client ID** e o **Client secret**. Guarde num lugar seguro até o passo 4.

### Passo 4. Cadastrar os segredos no GitHub
No repositório: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Crie três segredos, um de cada vez:

| Nome (exatamente assim) | Valor |
|---|---|
| `SHOPIFY_CLIENT_ID` | Client ID do passo 3 |
| `SHOPIFY_CLIENT_SECRET` | Client secret do passo 3 |
| `PAINEL_SENHA` | A senha do time. Mínimo de 12 caracteres; uma frase é o ideal, por exemplo `colorir-vestido-azul-2026` |

Depois de salvos, ninguém consegue ler esses valores de novo, nem você. Se esquecer a senha, é só cadastrar outra.

### Passo 5. Ligar o GitHub Pages
**Settings** → **Pages** → em **Build and deployment** → **Source**, escolha **GitHub Actions**.

### Passo 6. Primeira atualização
1. Aba **Actions**. Se o GitHub pedir, clique em **I understand my workflows, go ahead and enable them**.
2. À esquerda, clique em **Atualizar painel de vendas** → **Run workflow** → **Run workflow**.
3. Espere uns 2 a 3 minutos até aparecer o ✓ verde.
4. Volte em **Settings** → **Pages**. O endereço do painel aparece no topo, algo como `https://bryanpiccolo.github.io/vendaspintame/`.
5. Abra o endereço, digite a senha e confira os números.

Se der ✗ vermelho, clique na execução, abra o passo que falhou e copie a mensagem de erro para o Claude.

### Passo 7. Passar para o time
Mande para o time o endereço e, por outro canal, a senha (por exemplo, o link por e-mail e a senha por WhatsApp). Quem marcar "Lembrar neste aparelho" fica 30 dias sem precisar digitar de novo.

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
- **Sell-through** = peças vendidas ÷ (vendidas + estoque no fim do período). Estoque no 1º dia + entradas e ajustes − vendidas = estoque no último dia. As variantes de 6 e 12 canetinhas do mesmo tamanho e cor são a mesma peça, então o estoque conta uma vez só.
- **Estampa** é lida do nome do produto. **Tamanho** é lido do nome da variante.
