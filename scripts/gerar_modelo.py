# Converte a página do painel do Claude (index.html) no modelo estático src/painel.html
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (a[:70], s.count(a)); s = s.replace(a, b)
rep("const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());", "const hoje = DADOS.referencia;")
rep("const ontemD = new Date(Date.parse(hoje + 'T12:00:00Z') - 86400000);", "const ontemD = new Date(Date.parse(hoje + 'T12:00:00Z'));")
rep("const setTabela = (p) => { st.tp = p; const q = consulta(p); if (dash.params().consulta_produtos !== q) dash.setParams({ consulta_produtos: q }); };", "const setTabela = (p) => { st.tp = p; if (dash.params().periodo_produtos !== p) dash.setParams({ periodo_produtos: p }); };")
rep("const setGiro = (p) => { st.gp = p; const q = consulta(p, BASE_ESTOQUE, 'inventory_units_sold'); if (dash.params().consulta_estoque !== q) dash.setParams({ consulta_estoque: q }); };", "const setGiro = (p) => { st.gp = p; if (dash.params().periodo_estoque !== p) dash.setParams({ periodo_estoque: p }); };")
rep("if (p === 'm:' + mesAtual) return cap(nomeMes(mesAtual)) + ', do dia 1 até agora';", "if (p === 'm:' + mesAtual) return cap(nomeMes(mesAtual)) + ', do dia 1 até ' + dataBR(ontemD);")
rep("if (p === 'a:' + anoAtual) return 'Ano de ' + anoAtual + ', de 1º de janeiro até agora';", "if (p === 'a:' + anoAtual) return 'Ano de ' + anoAtual + ', de 1º de janeiro até ' + dataBR(ontemD);")
rep("No mês até agora:", "No mês até ontem:")
s = s.replace("(até hoje)", "(até ontem)").replace(" (até hoje, vs. mesmos dias)", " (até ontem, vs. mesmos dias)")
rep('<h1 class="pm-title">Vendas por produto e tamanho</h1>', '<h1 class="pm-title">Vendas Pinta Me</h1>\n    <p class="pm-window" id="atualizacao"></p>')
rep("<b>Categoria</b> é lida", "Os números são da venda fechada até o dia anterior e são atualizados todo dia por volta das 7h. <b>Categoria</b> é lida")
rep("Datas no fuso da loja (Brasília).", "Datas no fuso da loja (Brasília). O sell-through de um ano usa o estoque do início do primeiro mês e do fim do último mês.")
rep('<button type="button" role="tab" data-aba="estados" id="tab-estados">Vendas por estado</button>', '<button type="button" role="tab" data-aba="estados" id="tab-estados">Vendas por estado</button>\n    <button type="button" role="tab" data-aba="estoque" id="tab-estoque">Estoque</button>')
assert s.count("['mes', 'produtos', 'estados']") == 2; s = s.replace("['mes', 'produtos', 'estados']", "['mes', 'produtos', 'estados', 'estoque']")
rep('  <p class="pm-foot" id="notas">', '<!--ABA_ESTOQUE-->\n\n  <p class="pm-foot" id="notas">')
tokens = open(sys.argv[3]).read()
i = s.index('</style>'); s = s[:i] + tokens + s[i:]
shim = open(sys.argv[4]).read()
i = s.index('<script>'); s = s[:i] + shim + s[i:]
doc = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
       '<meta name="robots" content="noindex, nofollow">\n<title>Vendas Pinta Me</title>\n<link rel="icon" type="image/png" href="favicon.png">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<script>/*D3*/</script>\n</head>\n<body>\n<div id="dash-root">\n' + s + '\n<script>/*PREVISAO*/</script>\n<script>/*ESTOQUE*/</script>\n<script>EstoqueAba.define(DADOS);</script>\n</div>\n</body>\n</html>\n')
open(dst, 'w').write(doc)
print('ok', len(doc))
