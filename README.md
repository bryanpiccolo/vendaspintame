# Painel de vendas Pinta Me

Painel com a venda **fechada até o dia anterior**, atualizado todo dia às 7h (horário de Brasília) e protegido por senha. Tem quatro abas: vendas mês a mês, vendas por produto (com sell-through), vendas por estado e estoque (previsão de vendas, risco de ruptura e compra sugerida).

## Como funciona

1. Todo dia de manhã, uma **tarefa agendada no Claude** roda as consultas de vendas e de estoque no Shopify, com a conexão do Shopify da conta da Melina (só leitura).
2. As respostas são conferidas (`scripts/salvar.mjs`), viram a página `src/painel.html` (`scripts/build.mjs`) e são criptografadas com a senha do time (AES-256, via [StatiCrypt](https://github.com/robinmoisson/staticrypt)).
3. Só a página criptografada é publicada, no branch `gh-pages`, que o GitHub Pages serve (`scripts/publicar.sh`). O branch é refeito do zero todo dia, sem histórico, e os dados abertos nunca são gravados no repositório.

O que fica público neste repositório é só o código. Sem a senha, a página publicada é ilegível.

## Configuração (uma vez só)

1. **Repositório:** `bryanpiccolo/vendaspintame`, público, com o app do Claude no GitHub autorizado a escrever nele.
2. **GitHub Pages:** em **Settings → Pages → Build and deployment**, escolha **Deploy from a branch**, branch `gh-pages`, pasta `/ (root)`, e salve. O endereço fica `https://bryanpiccolo.github.io/vendaspintame/`.
3. **Tarefa agendada no Claude:** roda todo dia por volta das 6h50, para o painel estar pronto às 7h. A senha do painel fica só nessa tarefa.

## Uso no dia a dia

- **Atualizar fora do horário:** peça ao Claude para rodar a tarefa "Painel de vendas Pinta Me" agora.
- **Trocar a senha:** peça ao Claude para trocar a senha na tarefa e publicar de novo. Quem marcou "Lembrar neste aparelho" vai precisar digitar a senha nova.
- **Se a atualização falhar:** o Claude manda uma notificação. O painel continua mostrando a última versão publicada, e a data dela aparece no topo da página.
- **Depende de:** a conexão do Shopify continuar ativa na conta do Claude e o app do Claude no GitHub continuar com acesso a este repositório.

## Testar localmente

```bash
npm ci
node scripts/build.mjs --consultas                    # lista as consultas do dia
node scripts/salvar.mjs estados resposta.json         # confere e guarda cada resposta em .dados/
DADOS_DIR=.dados npm run build                        # gera dist/index.html (sem senha)
STATICRYPT_PASSWORD=uma-senha-de-teste npm run proteger
```

As pastas `.dados/`, `dist/`, `site/` e `teste/fixtures/` têm dados reais e estão no `.gitignore`: **nunca suba esses arquivos**.

## Definições

- **GMV** = vendas brutas − descontos + frete pago pelo cliente. Devoluções não são abatidas.
- **Receita líquida** = vendas brutas − descontos − devoluções, sem frete.
- **Margem bruta** = receita líquida − CMV, como o Shopify calcula. O CMV é o custo da variante registrado no momento da venda.
- **Sell-through** = peças vendidas ÷ (vendidas + estoque no fim do período). Estoque no 1º dia + entradas e ajustes − vendidas = estoque no último dia. As variantes de 6 e 12 canetinhas do mesmo tamanho e cor são a mesma peça, então o estoque conta uma vez só.
- **Estampa** é lida do nome do produto. **Tamanho** é lido do nome da variante.
- **Previsão (aba Estoque)**: sazonalidade de cada mês pela razão com a média móvel centrada de 12 meses (site, desde 2024); nível atual = média dos 3 últimos meses fechados sem a sazonalidade. O mês corrente junta o ritmo do mês (pela curva diária dos últimos 12 meses) com a previsão sazonal. Por produto e tamanho, a previsão da loja é dividida pela participação de cada peça nas vendas dos 3 últimos meses fechados + mês atual. **Comprar** = venda prevista em (prazo de reposição + cobertura) − estoque de hoje. Só considera vendas do site. Código em `src/previsao.js`, tela em `src/estoque.js` e `src/aba_estoque.html`.
