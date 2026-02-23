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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_settings'
      AND column_name = 'last_alert_email_sent_at'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD COLUMN last_alert_email_sent_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- stock_alert_disabled
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_settings'
      AND column_name = 'stock_alert_disabled'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD COLUMN stock_alert_disabled BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- unsubscribe_token
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_settings'
      AND column_name = 'unsubscribe_token'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD COLUMN unsubscribe_token TEXT DEFAULT NULL;
  END IF;

  -- unsubscribe_token_expires
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_settings'
      AND column_name = 'unsubscribe_token_expires'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD COLUMN unsubscribe_token_expires TIMESTAMPTZ DEFAULT NULL;
  END IF;
END$$;

-- 2) Index sur unsubscribe_token pour lookup rapide
CREATE INDEX IF NOT EXISTS idx_stock_alert_unsubscribe_token
  ON stock_alert_settings(unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

COMMIT;

-- Vérification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'stock_alert_settings'
ORDER BY ordinal_position;
