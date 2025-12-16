#!/bin/bash
# 🚨 SCRIPT DE RESTAURATION AUTOMATIQUE
# Usage: ./restore-backup.sh

set -e

echo "🔄 RESTAURATION DU SITE SHOPBRAIN AI"
echo "===================================="
echo ""

# Demander confirmation
echo "⚠️  Ceci va restaurer votre site au dernier backup stable (7ab68b2)"
echo "Les changements non pushés seront perdus."
read -p "Continuer? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Annulé"
  exit 1
fi

echo ""
echo "✅ Début de la restauration..."
echo ""

# Option 1: Utiliser la branche de backup
echo "📌 Restauration depuis la branche backup-complete-7ab68b2..."
git fetch origin
git checkout backup-complete-7ab68b2
echo "✅ Branche checkoutée"

# Force push
echo ""
echo "🔧 Force push vers main..."
git push -f origin main
echo "✅ Push force effectué"

echo ""
echo "✅ RESTAURATION COMPLÈTE!"
echo ""
echo "📝 Prochaines étapes:"
echo "  1. Attendre 2-3 minutes (build GitHub Actions)"
echo "  2. Vérifier: https://github.com/fdkng/SHOPBRAIN_AI/actions"
echo "  3. Hard refresh le site: https://fdkng.github.io/SHOPBRAIN_AI (Cmd+Shift+R)"
echo "  4. Vérifier que tout marche"
echo ""
echo "🎉 Votre site est restauré!"
