#!/bin/bash
# Met en ligne le Worker « hn-screen » (partage des captures de l'appli Hn screen !).
#   cd hn-screen-worker && bash deploy.sh
# La première fois, Wrangler ouvre le navigateur pour se connecter à Cloudflare.
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --no-audit --no-fund
W="npx wrangler"
$W whoami >/dev/null 2>&1 || $W login

if grep -q A_REMPLIR_PAR_DEPLOY_SH wrangler.jsonc; then
  echo "Création de l'espace de stockage des captures (KV)..."
  ID=$($W kv namespace list 2>/dev/null | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const l=JSON.parse(s.slice(s.indexOf("[")));const n=l.find(x=>/hn-screen-shots$/.test(x.title));if(n)console.log(n.id)}catch{}})')
  if [ -z "$ID" ]; then
    OUT=$($W kv namespace create hn-screen-shots 2>&1)
    echo "$OUT"
    ID=$(echo "$OUT" | grep -oE '[0-9a-f]{32}' | head -1)
  fi
  if [ -z "$ID" ]; then echo "Impossible de lire l'identifiant KV."; exit 1; fi
  sed -i.bak "s/A_REMPLIR_PAR_DEPLOY_SH/$ID/" wrangler.jsonc && rm -f wrangler.jsonc.bak
  echo "KV : $ID"
fi

$W deploy
echo ""
echo "C'est en ligne. Vérifie que l'adresse affichée ci-dessus est bien :"
echo "  https://hn-screen.heivoli-discord-auth.workers.dev"
