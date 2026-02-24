-- Migration: Ajout colonnes pour système d'email SMTP stock alerts
-- Date: 2026-02-23
-- Instructions: Copier-coller dans le SQL Editor de Supabase et exécuter.
--
-- Ajoute:
--   last_alert_email_sent_at  — date du dernier email envoyé
--   stock_alert_disabled      — true = ne plus envoyer d'email pour ce produit
--   unsubscribe_token         — token unique pour lien "Ne plus me rappeler"
--   unsubscribe_token_expires — expiration du token (30 jours)

BEGIN;

-- 1) Ajouter les nouvelles colonnes (IF NOT EXISTS via DO block)
DO $$
BEGIN
  -- last_alert_email_sent_at
 