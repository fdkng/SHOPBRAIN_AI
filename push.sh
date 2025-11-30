#!/bin/zsh
set -euo pipefail
cd ~/Library/CloudStorage/OneDrive-Personnel/Bureau/shopBrain_AI || { echo "Repo path not found"; exit 1; }

echo "1) Vérification fingerprint GitHub (ED25519):"
ssh-keyscan -t ed25519 github.com 2>/dev/null | ssh-keygen -lf - || true

echo "2) Ajout known_hosts (silencieux)..."
mkdir -p ~/.ssh
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true
chmod 700 ~/.ssh

if [[ ! -f ~/.ssh/id_ed25519.pub ]]; then
  EMAIL=$(git config user.email || echo "no-reply@example.com")
  echo "Aucune clé SSH ED25519 trouvée — création automatique avec email: $EMAIL"
  ssh-keygen -t ed25519 -C "$EMAIL" -f ~/.ssh/id_ed25519 -N "" >/dev/null
  eval "$(ssh-agent -s)" >/dev/null
  ssh-add ~/.ssh/id_ed25519 >/dev/null || true
  echo "Clé publique générée — tu dois l'ajouter sur GitHub si tu veux pousser via SSH:"
  cat ~/.ssh/id_ed25519.pub
  echo "Ajoute-la dans GitHub → Settings → SSH and GPG keys → New SSH key"
fi

if [[ ! -d .git ]]; then
  echo "Initialisation du dépôt git local..."
  git init
fi

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [[ -z "$REMOTE_URL" ]]; then
  echo "Ajout du remote SSH origin..."
  git remote add origin git@github.com:fdkng/SHOPBRAIN_AI.git || true
else
  echo "Remote origin trouvé: $REMOTE_URL"
fi

git add -A
git commit -m "Initial commit: prepare backend for deployment" || echo "Rien à committer / commit skipped"
git branch -M main

echo "Tentative de push SSH vers origin main..."
if git push -u origin main; then
  echo "Push SSH réussi."
  exit 0
fi

echo "Push SSH échoué — tentative de fallback HTTPS..."
git remote set-url origin https://github.com/fdkng/SHOPBRAIN_AI.git
if git push -u origin main; then
  echo "Push via HTTPS réussi. Si 2FA, utilise un PAT comme mot de passe."
  exit 0
else
  echo "Push via HTTPS a aussi échoué. Colle ici la sortie d'erreur."
  exit 2
fi
