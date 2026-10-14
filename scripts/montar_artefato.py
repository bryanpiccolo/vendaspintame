# Monta a página do painel no Claude (artefato) = index.html base + aba Estoque (arquivos do repositório)
import sys, json, subprocess
base, repo, dst = sys.argv[1], sys.argv[2], sys.argv[3]
# 4º argumento opcional: caminho do terser, para compactar os scripts (a página do Claude tem limite de 256 KB)
terser = sys.argv[4] if len(sys.argv) > 4 else None
s = open(base).read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:70], s.count(a)); s = s.replace(a, b)
rep('<button type="button" role="tab" data-aba="estados" id="tab-estados">Vendas por estado</button>', '<button type="button" role="tab" data-aba="estados" id="tab-estados">Vendas por estado</button>\n    <button type="button" role="tab" data-aba="estoque" id="tab-estoque">Estoque</button>\n    <button type="button" role="tab" data-aba="compra" id="tab-compra">Compra</button>\n    <button type="button" role="tab" data-aba="promocoes" id="tab-promocoes">Relatórios de promoção</button>')
rep("['mes', 'produtos', 'estados']", "['mes', 'produtos', 'estados', 'estoque', 'compra', 'promocoes']", 2)
aba = open(repo + '/src/aba_estoque.html').read() + open(repo + '/src/aba_compra.html').read() + open(repo + '/src/aba_promocoes.html').read()
fontes = '<span hidden data-source="diario"></span><span hidden data-source="pecas_meses"></span><span hidden data-source="estoque_atual"></span>\n'
rep('  <p class="pm-foot" id="notas">', aba + fontes + '\n  <p class="pm-foot" id="notas">')
rep("for (const id of ['mensal', 'ano_passado', 'ontem', 'produtos', 'estoque', 'estados', 'estados_ly'])", "for (const id of ['mensal', 'ano_passado', 'ontem', 'produtos', 'estoque', 'estados_ly', 'diario', 'pecas_meses', 'estoque_atual'])")
rep("    const gi = dash.data('giro');", "    if (window.estoqueOnData) window.estoqueOnData();\n    const gi = dash.data('giro');")
cola = open(repo + '/src/estoque_artefato.js').read()
promo_js = open(repo + '/src/promocoes.js').read()
assert promo_js.count('/*PROMO_CFG*/null') == 1
promo_js = promo_js.replace('/*PROMO_CFG*/null', json.dumps(json.load(open(repo + '/src/promocoes.json')), ensure_ascii=False))
for t in [open(repo + '/src/previsao.js').read(), open(repo + '/src/fichas.js').read(), open(repo + '/src/estoque.js').read(), open(repo + '/src/compra.js').read(), open(repo + '/src/historico.js').read(), open(repo + '/src/analise.js').read(), promo_js, cola]:
    assert '</script' not in t
    if terser:
        t = subprocess.run([terser, '--compress', '--mangle', '--ecma', '2020', '--format', 'ascii_only=true'], input=t, capture_output=True, text=True, check=True).stdout
    s = s.rstrip() + '\n<script>\n' + t + '\n</script>\n'
open(dst, 'w').write(s)
json.dump({'text': s}, open(dst + '.json', 'w'))
print('ok', len(s))
