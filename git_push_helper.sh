#!/usr/bin/env zsh
set -euo pipefail

# Usage: run from repo root
REPO_DIR="${1:-.}"
COMMIT_MSG="${2:-Initial commit: prepare backend for deployment}"
GITHUB_SSH_FINGERPRINT="SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"
HTTPS_REMOTE="https://github.com/fdkng/SHOPBRAIN_AI.git"

cd "$REPO_DIR" || { echo "Repo path not found: $REPO_DIR"; exit 1; }

echo "= Working directory: $(pwd)"

# Ensure ssh dir and perms
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Check GitHub ED25519 fingerprint and add known_host if it matches official
echo
echo "= Checking GitHub ED25519 host fingerprint..."
REMOTE_FP=$(ssh-keyscan -t ed25519 github.com 2>/dev/null | ssh-keygen -lf - | awk '{print $2}')
if [[ -z "$REMOTE_FP" ]]; then
  echo "Warning: could not fetch GitHub host key fingerprint."
else
  echo "Found remote fingerprint: $REMOTE_FP"
  if [[ "$REMOTE_FP" = "$GITHUB_SSH_FINGERPRINT" ]]; then
    echo "Fingerprint matches official GitHub fingerprint -> adding to ~/.ssh/known_hosts"
    ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true
  else
    echo "Fingerprint does NOT match official GitHub fingerprint."
    echo "Official: $GITHUB_SSH_FINGERPRINT"
    echo "Remote : $REMOTE_FP"
    echo "Skipping adding host key. If you are on a trusted network, you may add it manually."
  fi
fi

# Create SSH key if missing
if [[ ! -f ~/.ssh/id_ed25519.pub ]]; then
  echo
  echo "= No SSH ED25519 key found: generating one (no passphrase)."
  EMAIL="$(git config user.email || echo "no-reply@example.com")"
  ssh-keygen -t ed25519 -C "$EMAIL" -f ~/.ssh/id_ed25519 -N "" >/dev/null
  eval "$(ssh-agent -s)" >/dev/null
  ssh-add ~/.ssh/id_ed25519 >/dev/null || true
  echo "= Public key created. It will be printed below for you to add to GitHub."
  echo
  cat ~/.ssh/id_ed25519.pub
  echo
  echo "==> PLEASE add this key to GitHub: https://github.com/settings/ssh/new"
  read -r "REPLY?Press Enter after you've added the key to GitHub to continue..."
else
  echo
  echo "= Existing SSH key found."
fi

# Ensure git repo initialized
if [[ ! -d .git ]]; then
  echo
  echo "= Initializing git repository..."
  git init
fi

# Ensure remote origin exists (do not overwrite if present)
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [[ -z "$REMOTE_URL" ]]; then
  echo
  echo "= Adding SSH remote origin..."
  git remote add origin git@github.com:fdkng/SHOPBRAIN_AI.git || true
else
  echo
  echo "= Remote origin exists: $REMOTE_URL"
fi

# Stage and commit
echo
echo "= Staging and committing..."
git add -A
git commit -m "$COMMIT_MSG" || echo "Nothing to commit or commit skipped."

# Ensure main branch name
git branch -M main 2>/dev/null || true

# Attempt SSH push
echo
echo "= Attempting push via SSH..."
if git push -u origin main; then
  echo "= Push via SSH succeeded."
  exit 0
else
  echo "= Push via SSH failed — will attempt HTTPS fallback."
fi

# Fallback to HTTPS push
echo
echo "= Switching remote to HTTPS and pushing..."
git remote set-url origin "$HTTPS_REMOTE"
if git push -u origin main; then
  echo "= Push via HTTPS succeeded."
  exit 0
else
  echo "= Push via HTTPS failed. Paste the error output here and I will help."
  exit 2
fi
