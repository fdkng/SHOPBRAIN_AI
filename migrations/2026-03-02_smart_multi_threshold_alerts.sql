-- Migration: Système intelligent d'alertes multi-seuils
-- Date: 2026-03-02
-- Description:
--   - Ajoute `thresholds` (JSONB array, ex: [10, 5, 2]) pour multi-seuils par produit
--   - Ajoute `last_alerted_threshold` pour savoir quel seuil a déjà été alerté
--   - Ajoute `last_known_inventory` pour détecter un réapprovisionnement
--   - Ajoute `alert_reset_above` pour mémoriser si le stock est remonté au-dessus du seuil
--   - Met à jour stock_alert_log avec `threshold_triggered` pour traçabilité par seuil
--
-- Instructions: Copier-coller dans le SQL Editor de Supabase et exécuter.

BEGIN;

-- 1) Colonne multi-seuils (JSONB array, ex: [10, 5, 2])
-- Si le user n'a configuré qu'un seul seuil, on stocke [threshold]
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_settings'
      AND column_name = 'thresholds'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD COLUMN thresholds JSONB DEFAULT '[]'::jsonb;
  END IF;
END$$;

-- 2) Dernier seuil pour lequel une alerte a été envoyée
-- Ex: si on a alerté pour seuil=10, on ne réalerte pas pour 10, mais oui pour 5
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_settings'
      AND column_name = 'last_alerted_threshold'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD COLUMN last_alerted_threshold INTEGER DEFAULT NULL;
  END IF;
END$$;

-- 3) Dernier inventaire connu — permet de détecter réapprovisionnement
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_settings'
      AND column_name = 'last_known_inventory'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD COLUMN last_known_inventory INTEGER DEFAULT NULL;
  END IF;
END$$;

-- 4) Flag: le stock est remonté au-dessus des seuils → réinitialiser les alertes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_settings'
      AND column_name = 'alert_reset_above'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD COLUMN alert_reset_above BOOLEAN NOT NULL DEFAULT false;
  END IF;
END$$;

-- 5) Ajouter threshold_triggered au log (pour savoir quel seuil a déclenché l'alerte)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_alert_log'
      AND column_name = 'threshold_triggered'
  ) THEN
    ALTER TABLE stock_alert_log
      ADD COLUMN threshold_triggered INTEGER DEFAULT NULL;
  END IF;
END$$;

-- 6) Migrer les données existantes: copier threshold → thresholds si thresholds est vide
UPDATE stock_alert_settings
SET thresholds = jsonb_build_array(threshold)
WHERE (thresholds IS NULL OR thresholds = '[]'::jsonb)
  AND threshold IS NOT NULL
  AND threshold > 0;

COMMIT;

-- Vérification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'stock_alert_settings'
ORDER BY ordinal_position;
