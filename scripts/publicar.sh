#!/usr/bin/env bash
# Gera o painel com as respostas salvas em .dados/, criptografa com a senha e publica no branch gh-pages.
# Uso: PAINEL_SENHA='...' bash scripts/publicar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${#PAINEL_SENHA}" -lt 12 ]; then echo "ERRO: PAINEL_SENHA precisa ter pelo menos 12 caracteres"; exit 1; fi
npm ci --no-audit --no-fund --silent
DADOS_DIR="${DADOS_DIR:-.dados}" node scripts/build.mjs
rm -rf site
STATICRYPT_PASSWORD="$PAINEL_SENHA" npm run -s proteger
rm -rf dist
if grep -q "product_title" site/index.html; then echo "ERRO: a página saiu sem criptografia, publicação cancelada"; rm -rf site; exit 1; fi
touch site/.nojekyll
printf 'User-agent: *\nDisallow: /\n' > site/robots.txt
ORIGEM="$(git remote get-url origin)"
cd site
git init -q -b gh-pages
git add -A
git -c user.name="Painel Pinta Me" -c user.email="noreply@anthropic.com" commit -q -m "Painel atualizado em $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q --force "$ORIGEM" gh-pages
cd ..
rm -rf site .dados
echo "Publicado no branch gh-pages."
